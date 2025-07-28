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
const PORT = 5000;

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
  const mimetype = allowedTypes.test(file.mimetype); // Mimetype check might be less reliable for .txt

  // Basic check: if extension is allowed, accept it.
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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB file size limit
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
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
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
 * - comparisonKey: The header for structured data, or 'line_content' for plain text.
 */
function readFileContent(filePath, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();
  const isStructured = ext === ".xlsx" || ext === ".xls" || ext === ".csv";

  if (isStructured) {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // For CSV, XLSX.utils.sheet_to_json handles parsing automatically
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (json.length === 0) {
      return { data: [], type: "structured", comparisonKey: null };
    }

    const headers = json[0];
    const rows = json.slice(1).map((row) => {
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

    const comparisonKey = headers.length > 0 ? headers[0] : null; // Use first header as comparison key
    return { data: rows, type: "structured", comparisonKey: comparisonKey };
  } else {
    // Assume plain text for .txt and other non-structured files
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
    return { data: lines, type: "plain_text", comparisonKey: "line_content" }; // 'line_content' is a conceptual key
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
  let ws;
  if (dataType === "structured") {
    ws = XLSX.utils.json_to_sheet(data);
  } else {
    // plain_text
    // Convert array of strings to array of arrays for aoa_to_sheet
    const aoaData = data.map((line) => [line]);
    ws = XLSX.utils.aoa_to_sheet([["Line Content"], ...aoaData]); // Add a header for plain text
  }

  const csv = XLSX.utils.sheet_to_csv(ws);
  const filePath = path.join(tempCsvDir, filename);
  fs.writeFileSync(filePath, csv);
  return filePath;
}

// --- Express Routes ---

// Route to handle file uploads and perform cross-check
app.post(
  "/cross-check",
  upload.fields([
    { name: "fileA", maxCount: 1 },
    { name: "fileB", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const fileA = req.files["fileA"] ? req.files["fileA"][0] : null;
      const fileB = req.files["fileB"] ? req.files["fileB"][0] : null;

      if (!fileA || !fileB) {
        return res.status(400).json({
          success: false,
          message: "Please upload both File A and File B.",
        });
      }

      // Read files and determine their types and comparison keys
      const fileAContent = readFileContent(fileA.path, fileA.originalname);
      const fileBContent = readFileContent(fileB.path, fileB.originalname);

      const data1 = fileAContent.data;
      const data2 = fileBContent.data;
      const file1Type = fileAContent.type;
      const file2Type = fileBContent.type;
      const comparisonColumn = fileAContent.comparisonKey; // The key used for comparison from File A

      if (data1.length === 0) {
        fs.unlinkSync(fileA.path);
        fs.unlinkSync(fileB.path);
        return res.status(200).json({
          success: true,
          message: "File A is empty. Nothing to cross-check.",
          foundCount: 0,
          missingCount: 0,
          missingContents: [],
        });
      }
      if (data2.length === 0) {
        fs.unlinkSync(fileA.path);
        fs.unlinkSync(fileB.path);
        return res.status(200).json({
          success: true,
          message: "File B is empty. No contents to compare against.",
          foundCount: 0,
          missingCount: 0,
          missingContents: [],
        });
      }

      if (!comparisonColumn) {
        fs.unlinkSync(fileA.path);
        fs.unlinkSync(fileB.path);
        return res.status(400).json({
          success: false,
          message:
            "Could not determine a comparison key for File A. Ensure it has content or a first column.",
        });
      }

      // Build a set for efficient lookup from File B
      const values2Set = new Set();
      if (file2Type === "structured") {
        data2.forEach((row) => {
          const value = row[comparisonColumn]; // Use the same comparison key as File A
          if (value !== undefined && value !== null && value !== "") {
            values2Set.add(value);
          }
        });
      } else {
        // plain_text
        data2.forEach((line) => {
          if (line !== undefined && line !== null && line !== "") {
            values2Set.add(line);
          }
        });
      }

      const foundInFile2 = [];
      const missingInFile2 = [];

      for (const item1 of data1) {
        let value1;
        if (file1Type === "structured") {
          value1 = item1[comparisonColumn];
        } else {
          // plain_text
          value1 = item1; // The item itself is the line content
        }

        if (value1 !== undefined && value1 !== null && value1 !== "") {
          if (values2Set.has(value1)) {
            foundInFile2.push(item1); // Store the entire item (row object or line string)
          } else {
            missingInFile2.push(item1); // Store the entire item
          }
        } else {
          missingInFile2.push(item1); // Consider empty comparison values as missing
        }
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const matchedCsvFilename = `matched_contents_${timestamp}_${Date.now()}.csv`;
      const missingCsvFilename = `missing_contents_${timestamp}_${Date.now()}.csv`;

      let matchedCsvFilePath = null;
      if (foundInFile2.length > 0) {
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

      // Clean up uploaded source files immediately
      fs.unlinkSync(fileA.path);
      fs.unlinkSync(fileB.path);

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
        comparisonColumn: comparisonColumn,
      });
    } catch (error) {
      console.error("Server error during cross-check:", error);
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
