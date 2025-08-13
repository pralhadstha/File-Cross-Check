// server.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import XLSX from "xlsx";
import { fileURLToPath } from "url";

// Derive __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8090;

// Create an 'uploads' directory if it doesn't exist to store temporary files
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Create a 'temp_csv' directory to store temporary CSV files for download
const tempCsvDir = path.join(__dirname, "temp_csv");
if (!fs.existsSync(tempCsvDir)) {
  fs.mkdirSync(tempCsvDir);
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

// Filter to allow Excel, CSV, and Text files
const fileFilter = (req, file, cb) => {
  const allowedTypes = /xlsx|xls|txt|csv/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );

  if (extname) {
    return cb(null, true);
  } else {
    cb(
      new Error(
        "Only Excel (.xlsx, .xls), Text (.txt), and CSV (.csv) files are allowed!"
      ),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// --- Helper Functions ---

/**
 * Formats a JavaScript Date object into a YYYY-MM-DD string.
 * @param {Date} date The Date object to format.
 * @returns {string} The formatted date string.
 */
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    return ""; // Return empty string for invalid dates
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Reads the content of a file (Excel, CSV, or plain text).
 * @param {string} filePath The path to the file.
 * @param {string} originalFilename The original name of the file to determine type.
 * @returns {Object} An object containing:
 * - data: Array<Object> for structured, Array<string> for plain text.
 * - type: 'structured' (for Excel/CSV) or 'plain_text'.
 * - headers: Array<string> of headers for structured files, empty array for plain text.
 * - firstColumnHeader: The header of the first column for structured data, or 'Line Content' for plain text.
 */
function readFileContent(filePath, originalFilename) {
  console.log(`[readFileContent] Starting to read file: ${originalFilename}`);
  const ext = path.extname(originalFilename).toLowerCase();
  const isStructured = ext === ".xlsx" || ext === ".xls" || ext === ".csv";

  if (isStructured) {
    console.log(
      `[readFileContent] Reading structured file (Excel/CSV): ${originalFilename}`
    );
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    console.log(`[readFileContent] Workbook read for: ${originalFilename}`);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
    });
    console.log(
      `[readFileContent] Converted to JSON array for: ${originalFilename}, rows: ${rawData.length}`
    );

    if (rawData.length === 0) {
      console.log(`[readFileContent] File is empty: ${originalFilename}`);
      return {
        data: [],
        type: "structured",
        headers: [],
        firstColumnHeader: null,
      };
    }

    const headers = rawData[0]
      .map((h) => String(h || "").trim())
      .filter((h) => h !== "");
    const rows = rawData.slice(1).map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        let value = row[index];
        if (value instanceof Date) {
          value = formatDate(value);
        }
        obj[header] = value;
      });
      return obj;
    });
    console.log(
      `[readFileContent] Processed rows for structured file: ${originalFilename}, actual data rows: ${rows.length}`
    );

    const firstColumnHeader = headers.length > 0 ? headers[0] : null;
    return {
      data: rows,
      type: "structured",
      headers: headers,
      firstColumnHeader: firstColumnHeader,
    };
  } else {
    // Assume plain text for .txt and other non-structured files
    console.log(
      `[readFileContent] Reading plain text file: ${originalFilename}`
    );
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
    console.log(
      `[readFileContent] Read ${lines.length} lines from plain text file: ${originalFilename}`
    );
    return {
      data: lines,
      type: "plain_text",
      headers: [],
      firstColumnHeader: "Line Content",
    };
  }
}

/**
 * Generates and saves a CSV file from an array of data (objects or strings).
 * @param {Array<Object>|Array<string>} data The data to write to the CSV file.
 * @param {string} filename The name of the file to save.
 * @param {string} dataType 'structured' or 'plain_text' indicating the data format.
 * @returns {string} The full path to the saved CSV file.
 */
function saveCsvFile(data, filename, dataType) {
  console.log(
    `[saveCsvFile] Starting to save CSV: ${filename}, type: ${dataType}, data items: ${data.length}`
  );
  let ws;
  if (dataType === "structured") {
    ws = XLSX.utils.json_to_sheet(data);
  } else {
    const aoaData = data.map((line) => [line]);
    ws = XLSX.utils.aoa_to_sheet([["Line Content"], ...aoaData]);
  }

  const csv = XLSX.utils.sheet_to_csv(ws);
  const filePath = path.join(tempCsvDir, filename);
  fs.writeFileSync(filePath, csv);
  console.log(`[saveCsvFile] Successfully saved CSV: ${filePath}`);
  return filePath;
}

// --- Express Routes ---

// Route to get headers for the dropdown (when files are selected)
app.post(
  "/get-headers",
  upload.fields([
    { name: "fileA", maxCount: 1 },
    { name: "fileB", maxCount: 1 },
  ]),
  async (req, res) => {
    console.log("[GET_HEADERS] Request received.");
    try {
      const fileA = req.files["fileA"] ? req.files["fileA"][0] : null;
      const fileB = req.files["fileB"] ? req.files["fileB"][0] : null;

      if (!fileA || !fileB) {
        console.log("[GET_HEADERS] Error: File A or File B missing.");
        return res.status(400).json({
          success: false,
          message: "Please upload both files to get headers.",
        });
      }
      console.log(
        `[GET_HEADERS] Files received: ${fileA.originalname}, ${fileB.originalname}`
      );

      const fileAContent = readFileContent(fileA.path, fileA.originalname);
      const fileBContent = readFileContent(fileB.path, fileB.originalname);
      console.log(
        "[GET_HEADERS] Files read successfully for headers extraction."
      );

      // Clean up uploaded files immediately after reading headers
      fs.unlinkSync(fileA.path);
      fs.unlinkSync(fileB.path);
      console.log("[GET_HEADERS] Temporary upload files cleaned up.");

      // Determine if both files are structured (Excel/CSV)
      const areBothStructured =
        fileAContent.type === "structured" &&
        fileBContent.type === "structured";

      let uniqueHeaders = [];
      if (areBothStructured) {
        uniqueHeaders = Array.from(
          new Set([...fileAContent.headers, ...fileBContent.headers])
        ).filter((h) => h && h.trim() !== "");
      } else {
        uniqueHeaders = ["Line Content"];
      }

      if (uniqueHeaders.length === 0 && areBothStructured) {
        uniqueHeaders = ["No Headers Found"];
      }
      console.log("[GET_HEADERS] Unique headers determined:", uniqueHeaders);

      res.json({
        success: true,
        headers: uniqueHeaders,
        fileAType: fileAContent.type,
      });
    } catch (error) {
      console.error("[GET_HEADERS] Server error getting headers:", error);
      if (req.files && req.files["fileA"] && req.files["fileA"][0])
        fs.unlinkSync(req.files["fileA"][0].path);
      if (req.files && req.files["fileB"] && req.files["fileB"][0])
        fs.unlinkSync(req.files["fileB"][0].path);
      res.status(500).json({
        success: false,
        message: `An error occurred while getting headers: ${error.message}`,
      });
    }
  }
);

// Route to handle file uploads and perform cross-check
app.post(
  "/cross-check",
  upload.fields([
    { name: "fileA", maxCount: 1 },
    { name: "fileB", maxCount: 1 },
  ]),
  async (req, res) => {
    console.log("[CROSS_CHECK] Request received.");
    try {
      const fileA = req.files["fileA"] ? req.files["fileA"][0] : null;
      const fileB = req.files["fileB"] ? req.files["fileB"][0] : null;
      const selectedColumn = req.body.selectedColumn; // Get the selected column from the form data
      console.log(`[CROSS_CHECK] Selected column: ${selectedColumn}`);

      if (!fileA || !fileB) {
        console.log("[CROSS_CHECK] Error: File A or File B missing.");
        return res.status(400).json({
          success: false,
          message: "Please upload both File A and File B.",
        });
      }
      console.log(
        `[CROSS_CHECK] Files received: ${fileA.originalname}, ${fileB.originalname}`
      );

      console.log("[CROSS_CHECK] Reading file A content...");
      const fileAContent = readFileContent(fileA.path, fileA.originalname);
      console.log("[CROSS_CHECK] Reading file B content...");
      const fileBContent = readFileContent(fileB.path, fileB.originalname);
      console.log("[CROSS_CHECK] Both files read.");

      const data1 = fileAContent.data;
      const data2 = fileBContent.data;
      const file1Type = fileAContent.type;
      const file2Type = fileBContent.type;

      let actualComparisonColumn;

      // Determine the actual column to use for comparison
      if (file1Type === "structured" && file2Type === "structured") {
        actualComparisonColumn = selectedColumn;
        if (!fileAContent.headers.includes(actualComparisonColumn)) {
          console.log(
            `[CROSS_CHECK] Error: Selected column '${actualComparisonColumn}' not found in File A headers.`
          );
          fs.unlinkSync(fileA.path);
          fs.unlinkSync(fileB.path);
          return res.status(400).json({
            success: false,
            message: `Selected column '${actualComparisonColumn}' not found in File A headers. Please select a valid column.`,
          });
        }
      } else {
        actualComparisonColumn = "Line Content"; // Default for plain text comparison
      }
      console.log(
        `[CROSS_CHECK] Comparison will be based on: '${actualComparisonColumn}'`
      );

      if (data1.length === 0) {
        fs.unlinkSync(fileA.path);
        fs.unlinkSync(fileB.path);
        console.log("[CROSS_CHECK] File A is empty.");
        return res.status(200).json({
          success: true,
          message: "File A is empty. Nothing to cross-check.",
          foundCount: 0,
          missingCount: 0,
          missingContents: [],
          totalFile1Rows: 0,
          file1Name: fileA.originalname,
          file2Name: fileB.originalname,
          comparisonColumn: actualComparisonColumn,
        });
      }
      if (data2.length === 0) {
        fs.unlinkSync(fileA.path);
        fs.unlinkSync(fileB.path);
        console.log("[CROSS_CHECK] File B is empty.");
        return res.status(200).json({
          success: true,
          message: "File B is empty. No contents to compare against.",
          foundCount: 0,
          missingCount: 0,
          missingContents: [],
          totalFile1Rows: data1.length,
          file1Name: fileA.originalname,
          file2Name: fileB.originalname,
          comparisonColumn: actualComparisonColumn,
        });
      }

      console.log(
        `[CROSS_CHECK] Building lookup set from File B (${data2.length} items)...`
      );
      const values2Set = new Set();
      if (file2Type === "structured") {
        data2.forEach((row) => {
          const value = row[actualComparisonColumn];
          if (value !== undefined && value !== null && value !== "") {
            values2Set.add(String(value));
          }
        });
      } else {
        data2.forEach((line) => {
          if (line !== undefined && line !== null && line !== "") {
            values2Set.add(String(line));
          }
        });
      }
      console.log(
        `[CROSS_CHECK] Lookup set built with ${values2Set.size} unique values.`
      );

      const foundInFile2 = [];
      const missingInFile2 = [];

      console.log(
        `[CROSS_CHECK] Starting comparison of File A (${data1.length} items) against File B.`
      );
      for (const item1 of data1) {
        let value1;
        if (file1Type === "structured") {
          value1 = item1[actualComparisonColumn];
        } else {
          value1 = item1;
        }

        if (value1 !== undefined && value1 !== null && value1 !== "") {
          if (values2Set.has(String(value1))) {
            foundInFile2.push(item1);
          } else {
            missingInFile2.push(item1);
          }
        } else {
          missingInFile2.push(item1);
        }
      }
      console.log(
        `[CROSS_CHECK] Comparison complete. Found: ${foundInFile2.length}, Missing: ${missingInFile2.length}`
      );

      const timestamp = new Date().toISOString().slice(0, 10);
      const matchedCsvFilename = `matched_contents_${timestamp}_${Date.now()}.csv`;
      const missingCsvFilename = `missing_contents_${timestamp}_${Date.now()}.csv`;

      let matchedCsvFilePath = null;
      if (foundInFile2.length > 0) {
        console.log("[CROSS_CHECK] Saving matched CSV file...");
        matchedCsvFilePath = saveCsvFile(
          foundInFile2,
          matchedCsvFilename,
          file1Type
        );
        setTimeout(() => {
          if (fs.existsSync(matchedCsvFilePath)) {
            fs.unlink(matchedCsvFilePath, (err) => {
              if (err)
                console.error(
                  `Error deleting temp matched CSV: ${err.message}`
                );
              else
                console.log(
                  `Cleaned up temp matched CSV: ${matchedCsvFilename}`
                );
            });
          }
        }, 5 * 60 * 1000); // 5 minutes
      }

      let missingCsvFilePath = null;
      if (missingInFile2.length > 0) {
        console.log("[CROSS_CHECK] Saving missing CSV file...");
        missingCsvFilePath = saveCsvFile(
          missingInFile2,
          missingCsvFilename,
          file1Type
        );
        setTimeout(() => {
          if (fs.existsSync(missingCsvFilePath)) {
            fs.unlink(missingCsvFilePath, (err) => {
              if (err)
                console.error(
                  `Error deleting temp missing CSV: ${err.message}`
                );
              else
                console.log(
                  `Cleaned up temp missing CSV: ${missingCsvFilename}`
                );
            });
          }
        }, 5 * 60 * 1000); // 5 minutes
      }
      console.log("[CROSS_CHECK] CSV files saving process initiated.");

      // Clean up uploaded source files immediately
      fs.unlinkSync(fileA.path);
      fs.unlinkSync(fileB.path);
      console.log("[CROSS_CHECK] Original upload files cleaned up.");

      res.json({
        success: true,
        message: "Cross-check completed successfully! CSV files generated.",
        foundCount: foundInFile2.length,
        missingCount: missingInFile2.length,
        totalFile1Rows: data1.length,
        missingContents: missingInFile2.slice(0, 10), // Still send sample for on-screen display
        matchedCsvFilename: foundInFile2.length > 0 ? matchedCsvFilename : null,
        missingCsvFilename:
          missingInFile2.length > 0 ? missingCsvFilename : null,
        file1Name: fileA.originalname,
        file2Name: fileB.originalname,
        comparisonColumn: actualComparisonColumn, // Report the actual column used for comparison
      });
      console.log("[CROSS_CHECK] Response sent to client.");
    } catch (error) {
      console.error("[CROSS_CHECK] Server error during cross-check:", error);
      // Clean up uploaded files in case of error
      if (req.files && req.files["fileA"] && req.files["fileA"][0])
        fs.unlinkSync(req.files["fileA"][0].path);
      if (req.files && req.files["fileB"] && req.files["fileB"][0])
        fs.unlinkSync(req.files["fileB"][0].path);
      res.status(500).json({
        success: false,
        message: `An error occurred: ${error.message}`,
      });
    }
  }
);

// Endpoint to download generated CSV files
app.get("/download-csv/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(tempCsvDir, filename);

  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.download(filePath, (err) => {
      if (err) {
        console.error(`Error downloading file ${filename}:`, err);
        if (!res.headersSent) {
          res.status(500).send("Error downloading file.");
        }
      } else {
        // Delete the file after successful download
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr)
            console.error(
              `Error deleting temp CSV after download: ${unlinkErr.message}`
            );
          else console.log(`Cleaned up temp CSV after download: ${filename}`);
        });
      }
    });
  } else {
    res.status(404).send("File not found or has expired.");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Open your browser to http://localhost:${PORT}`);
});
