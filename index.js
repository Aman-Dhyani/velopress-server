import express from "express";
import cors from "cors";
import { reduceUnusedCss } from "./purge/reduceUnusedCss.js";
import { generateCriticalCss } from "./critical/critical.js";
import { removeDuplicateCss } from "./utils/removeDuplicateCss.js";
import "dotenv"

const app = express();
const port = process.env.PORT || 4000;

// Middleware to parse JSON request bodies
app.use(express.json());
app.use(cors());

function createFileNameAndPermalink(pageName, postType) {
  try {
    // Create a safe filename based on pageName and postType
    const safeName = pageName.toLowerCase().replace(/\s+/g, "-");
    const baseFilename = `vp-category_${postType}-${safeName}.css`;

    return {
      filename: baseFilename, // Generated filename
    };
  } catch (error) {
    console.error(`❌ Error creating permalink and filename: ${error}`);
    return {
      filename: "",
    };
  }
}

// Route for generating critical CSS
app.post("/velopress/critical", async (req, res) => {
  let { urls } = req.body;

  // Ensure urls is an array of URLs
  if (!Array.isArray(urls)) {
    return res
      .status(400)
      .send({ error: "The 'urls' field must be an array of URLs." });
  }

  try {
    // Call the function to generate critical CSS
    const results = await generateCriticalCss(urls);
    const response = { status: "success", message: "Critical Css Generated" };

    if (results.length > 1) {
      // Combine all CSS and remove duplicates if there are multiple results
      const combinedCss = results.map((result) => result.css).join("\n");
      response.type = "merged";
      response.criticalCss = await removeDuplicateCss(combinedCss);
    } else {
      // If only one result, use it directly
      response.type = "specific";
      response.criticalCss = results[0].css;
    }

    // Send the response once
    res.status(200).send(response);
  } catch (error) {
    const errorMessage = "Error generating critical CSS: " + error.message;
    res.status(500).send(errorMessage);
  }
});

// Route for reducing unused CSS
app.post("/velopress/purge", async (req, res) => {
  const { pageName, postType, url, safelists } = req.body;

  try {
    const safelistArray = (safelists || "").split(",").map(s => s.trim()).filter(Boolean);    

    // Call function to generate permalink and filename
    const cleanedCss = await reduceUnusedCss(url, safelistArray, true);
    const { filename } = createFileNameAndPermalink(pageName, postType);
    // const cleanedCss = await reduceUnusedCss(url, [], true);
    
    // Prepare the response
    const response = {
      message: "Unused CSS removal started",
      postType,
      permalink: url,
      filename,
      cleanedCss,
    };

    // Send the response
    res.json(response);
  } catch (error) {
    console.error("Error in /velopress/purge:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to reduce CSS",
      error: error.message,
    });
  }
});

app.get("/velopress", (req, res) => {
  res.send("Hello from Velopress root");
});

// Start the server
app.listen(port, () => {
  console.log(`Velopress server running at http://localhost:${port}`);
});
