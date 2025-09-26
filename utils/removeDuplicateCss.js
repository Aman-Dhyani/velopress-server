import postcss from 'postcss';
import discardDuplicates from 'postcss-discard-duplicates';

export async function removeDuplicateCss(css) {
  try {
    const result = await postcss([discardDuplicates]).process(css, { from: undefined });
    return result.css;
  } catch (error) {
    console.error('❌ Error removing duplicate CSS:', error.message);
    return css;
  }
}