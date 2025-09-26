import puppeteer from 'puppeteer';
import { PurgeCSS } from 'purgecss';
import postcss from 'postcss';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { removeDuplicateCss } from '../utils/removeDuplicateCss.js';
import safeParser from 'postcss-safe-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function sanitizeCss(css) {
  return css.replace(/!important/g, '');
}

// PostCSS plugin to remove child selectors of safelisted classes
function removeChildSelectorsPlugin(safelist) {
  return {
    postcssPlugin: 'remove-child-selectors',
    Rule(rule) {
      for (let safe of safelist) {
        if (
          rule.selector.startsWith(`.${safe} `) ||
          rule.selector.startsWith(`.${safe}>`) ||
          rule.selector.match(new RegExp(`\\.${safe}\\s+`))
        ) {
          rule.remove();
          break;
        }
      }
    }
  };
}
removeChildSelectorsPlugin.postcss = true;

// Detect complex selectors like :hover, :focus, etc.
function detectComplexSelectors(css) {
  const complexSelectorsRegex = /:(after|before|where|is|not|has|nth-child|nth-of-type|first-child|last-child|focus-within|focus|hover)/g;
  const complexSelectors = [];

  const matches = css.match(complexSelectorsRegex);
  if (matches) {
    matches.forEach(selector => {
      if (!complexSelectors.includes(selector)) {
        complexSelectors.push(selector);
      }
    });
  }

  return complexSelectors;
}

// Extract media queries
async function extractMediaQueries(css) {
  let mediaRules = '';
  let otherRules = '';

  const result = await postcss([
    {
      postcssPlugin: 'split-media',
      AtRule(atRule) {
        if (atRule.name === 'media') {
          mediaRules += atRule.toString() + '\n';
          atRule.remove();
        }
      }
    }
  ]).process(css, { from: undefined, parser: safeParser });

  return {
    mediaCss: mediaRules,
    nonMediaCss: result.css
  };
}

// MAIN FUNCTION
export async function reduceUnusedCss(url, safelist = [], preserveChildren = true) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });

  const htmlContent = await page.content();

  const cssHrefs = await page.$$eval('link[rel="stylesheet"]', links =>
    links.map(link => link.href)
  );

  const jsHrefs = await page.$$eval('script[src]', scripts =>
    scripts.map(script => script.src)
  );

  console.log('🔍 CSS files:');
  cssHrefs.forEach(href => console.log('  -', href));
  console.log('🔍 JS files:');
  jsHrefs.forEach(href => console.log('  -', href));

  let fullCss = '';
  for (let href of cssHrefs) {
    try {
      const response = await page.goto(href);
      const css = await response.text();
      console.log(`✅ Fetched CSS from: ${href}`);
      fullCss += sanitizeCss(css) + '\n'; // Sanitize the CSS before appending
    } catch (e) {
      console.warn(`⚠️ Failed to fetch CSS from: ${href}`);
    }
  }

  let fullJs = '';
  for (let href of jsHrefs) {
    try {
      const response = await page.goto(href);
      const js = await response.text();
      console.log(`✅ Fetched JS from: ${href}`);
      fullJs += js + '\n';
    } catch (e) {
      console.warn(`⚠️ Failed to fetch JS from: ${href}`);
    }
  }

  const tempHtmlPath = path.join(__dirname, 'temp-page.html');
  fs.writeFileSync(tempHtmlPath, htmlContent);

  const tempJsPath = path.join(__dirname, 'temp-scripts.js');
  fs.writeFileSync(tempJsPath, fullJs);

  const { mediaCss, nonMediaCss } = await extractMediaQueries(fullCss);

  const complexSelectors = detectComplexSelectors(fullCss);
  console.log('🔍 Complex selectors found:', complexSelectors);

  let purgeSafelist;
  if (preserveChildren) {
    const childPatterns = complexSelectors.map(sel => new RegExp(`${sel}(\\s|>|$)`));
    purgeSafelist = {
      standard: [...safelist, ...complexSelectors],
      deep: childPatterns,
      greedy: childPatterns
    };
  } else {
    purgeSafelist = {
      standard: [...safelist, ...complexSelectors]
    };
  }

  const purgeHtml = await new PurgeCSS().purge({
    content: [tempHtmlPath],
    css: [{ raw: nonMediaCss }],
    safelist: purgeSafelist
  });

  const purgeJs = await new PurgeCSS().purge({
    content: [tempJsPath],
    css: [{ raw: nonMediaCss }],
    safelist: purgeSafelist
  });

  fs.unlinkSync(tempHtmlPath);
  fs.unlinkSync(tempJsPath);
  await browser.close();

  let mergedCss = purgeHtml[0].css + '\n' + purgeJs[0].css;
  mergedCss = await removeDuplicateCss(mergedCss);
  mergedCss += '\n' + mediaCss;

  if (!preserveChildren) {
    mergedCss = await postcss([
      removeChildSelectorsPlugin(safelist),
    ]).process(mergedCss, { from: undefined }).then(r => r.css);
  }

  return mergedCss;
}

// Example call (uncomment to run standalone)
// reduceUnusedCss("http://aman.local/#", [], true);
