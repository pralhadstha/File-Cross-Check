// Get references to DOM elements
const file1Input = document.getElementById("file1Input");
const file2Input = document.getElementById("file2Input");
const uploadForm = document.getElementById("uploadForm");
const crossCheckBtn = document.getElementById("crossCheckBtn");
const messageBox = document.getElementById("messageBox");
const resultsSection = document.getElementById("resultsSection");
const resultsSummary = document.getElementById("resultsSummary");
const downloadMatchedSection = document.getElementById(
  "downloadMatchedSection"
);
const downloadMatchedBtn = document.getElementById("downloadMatchedBtn");
const downloadMissingSection = document.getElementById(
  "downloadMissingSection"
);
const downloadMissingBtn = document.getElementById("downloadMissingBtn");
const missingContentsDisplay = document.getElementById(
  "missingContentsDisplay"
);
const buttonText = document.getElementById("buttonText");
const loadingSpinner = document.getElementById("loadingSpinner");
const headerSelect = document.getElementById("headerSelect"); // Re-added
const headerMessage = document.getElementById("headerMessage"); // New element for messages

/**
 * Displays a message in the message box.
 * @param {string} message The message to display.
 * @param {boolean} isError True if it's an error message, false for success/info.
 */
function showMessage(message, isError = true) {
  messageBox.textContent = message;
  messageBox.classList.remove(
    "hidden",
    "bg-green-50",
    "text-green-700",
    "border-green-400",
    "bg-red-50",
    "text-red-700",
    "border-red-400"
  );
  if (isError) {
    messageBox.classList.add("bg-red-50", "text-red-700", "border-red-400");
  } else {
    messageBox.classList.add(
      "bg-green-50",
      "text-green-700",
      "border-green-400"
    );
  }
  messageBox.classList.add("show"); // Use 'show' class for display
}

/**
 * Hides the message box.
 */
function hideMessage() {
  messageBox.classList.remove("show");
  messageBox.textContent = "";
}

/**
 * Shows the loading indicator.
 * @param {string} text The text to display next to the spinner.
 */
function showLoading(text = "Processing your files, please wait🙏...") {
  buttonText.textContent = text;
  loadingSpinner.classList.remove("hidden");
  loadingSpinner.classList.add("show");
  crossCheckBtn.disabled = true;
  file1Input.disabled = true;
  file2Input.disabled = true;
  headerSelect.disabled = true; // Disable header select during loading
}

/**
 * Hides the loading indicator.
 */
function hideLoading() {
  buttonText.textContent = "Cross-Check Files";
  loadingSpinner.classList.remove("show");
  loadingSpinner.classList.add("hidden");
  crossCheckBtn.disabled = false;
  file1Input.disabled = false;
  file2Input.disabled = false;
  // headerSelect.disabled = false; // Re-enable after cross-check, if applicable
}

/**
 * Fetches headers from the server and populates the dropdown.
 */
async function fetchAndPopulateHeaders() {
  const file1 = file1Input.files[0];
  const file2 = file2Input.files[0];

  if (!file1 || !file2) {
    headerSelect.innerHTML =
      '<option value="">Upload both files to load options...</option>';
    headerSelect.disabled = true;
    crossCheckBtn.disabled = true;
    headerMessage.textContent = "";
    return;
  }

  headerSelect.innerHTML =
    '<option value="">Loading column headers...</option>';
  headerSelect.disabled = true;
  crossCheckBtn.disabled = true;
  headerMessage.textContent = "Fetching column headers...";
  hideMessage();

  const formData = new FormData();
  formData.append("fileA", file1);
  formData.append("fileB", file2);

  try {
    const response = await fetch("/get-headers", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (result.success) {
      headerSelect.innerHTML = ""; // Clear existing options
      if (result.headers && result.headers.length > 0) {
        if (result.fileAType === "structured") {
          headerSelect.appendChild(new Option("Select a column...", "")); // Prompt for selection
          result.headers.forEach((header) => {
            headerSelect.appendChild(new Option(header, header));
          });
          headerSelect.disabled = false;
          headerMessage.textContent = "";
        } else {
          // Plain text files
          headerSelect.appendChild(new Option("Line Content", "Line Content"));
          headerSelect.disabled = true; // Disable selection as it's line-by-line
          headerMessage.textContent =
            "Comparison will be line-by-line for text files.";
          crossCheckBtn.disabled = false; // Enable cross-check button immediately
        }
        // If it's structured, crossCheckBtn remains disabled until a column is selected
        if (result.fileAType === "structured" && headerSelect.value === "") {
          crossCheckBtn.disabled = true;
        } else if (
          result.fileAType === "structured" &&
          headerSelect.value !== ""
        ) {
          crossCheckBtn.disabled = false;
        }
      } else {
        headerSelect.innerHTML =
          '<option value="">No headers found or files are empty.</option>';
        headerSelect.disabled = true;
        crossCheckBtn.disabled = true;
        headerMessage.textContent = "No suitable headers found for comparison.";
      }
    } else {
      showMessage(result.message, true);
      headerSelect.innerHTML =
        '<option value="">Error loading headers.</option>';
      headerSelect.disabled = true;
      crossCheckBtn.disabled = true;
      headerMessage.textContent = "Error: " + result.message;
    }
  } catch (error) {
    console.error("Error fetching headers:", error);
    showMessage(`An error occurred fetching headers: ${error.message}`, true);
    headerSelect.innerHTML =
      '<option value="">Network error loading headers.</option>';
    headerSelect.disabled = true;
    crossCheckBtn.disabled = true;
    headerMessage.textContent = "Network error loading headers.";
  }
}

// Event listeners for file input changes to trigger header loading
file1Input.addEventListener("change", fetchAndPopulateHeaders);
file2Input.addEventListener("change", fetchAndPopulateHeaders);

// Event listener for header selection change to enable/disable button
headerSelect.addEventListener("change", () => {
  // Enable cross-check button only if a header is selected (and it's not the placeholder)
  if (
    headerSelect.value !== "" &&
    headerSelect.value !== "Loading headers..." &&
    headerSelect.value !== "No headers found or files are empty." &&
    headerSelect.value !== "Error loading headers."
  ) {
    crossCheckBtn.disabled = false;
  } else {
    crossCheckBtn.disabled = true;
  }
});

// Event listener for the form submission
uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // Prevent default form submission

  hideMessage();
  resultsSection.classList.add("hidden");
  downloadMatchedSection.classList.add("hidden");
  downloadMissingSection.classList.add("hidden");
  missingContentsDisplay.innerHTML = "";

  const file1 = file1Input.files[0];
  const file2 = file2Input.files[0];
  const selectedColumn = headerSelect.value; // Get the selected column value

  if (!file1 || !file2) {
    showMessage("Please select both File A and File B.");
    return;
  }

  // Validate selected column if it's not a plain text scenario
  if (headerSelect.disabled === false && selectedColumn === "") {
    showMessage("Please select a column header for comparison.");
    return;
  }

  showLoading("Cross-Checking, please wait🙏...");

  const formData = new FormData();
  formData.append("fileA", file1);
  formData.append("fileB", file2);
  formData.append("selectedColumn", selectedColumn); // Append the selected column

  try {
    const response = await fetch("/cross-check", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (result.success) {
      // Display results summary
      resultsSummary.innerHTML = `
              <p class="text-lg font-semibold">File A ('${result.file1Name}') contains ${result.totalFile1Rows} items.</p>
              <p class="text-lg font-semibold">Out of these, <span class="text-green-600">${result.foundCount}</span> items were found in File B ('${result.file2Name}') based on the <b>'${result.comparisonColumn}'</b>.</p>
              <p class="text-lg font-semibold">The remaining <span class="text-red-600">${result.missingCount}</span> items were NOT found in File B based on the <b>'${result.comparisonColumn}'</b>.</p>
            `;

      if (result.matchedCsvFilename) {
        downloadMatchedSection.classList.remove("hidden");
        downloadMatchedBtn.href = `/download-csv/${result.matchedCsvFilename}`;
        downloadMatchedBtn.download = result.matchedCsvFilename; // Ensure correct download name
      } else {
        downloadMatchedSection.classList.add("hidden");
      }

      if (result.missingCsvFilename) {
        downloadMissingSection.classList.remove("hidden");
        downloadMissingBtn.href = `/download-csv/${result.missingCsvFilename}`;
        downloadMissingBtn.download = result.missingCsvFilename; // Ensure correct download name

        // --- START: MODIFIED DISPLAY LOGIC FOR missingContents ---
        if (result.missingContents && result.missingContents.length > 0) {
          let displayHtml = "";
          // Check if the missing content items are objects (structured data) or strings (plain text)
          const isStructured =
            typeof result.missingContents[0] === "object" &&
            result.missingContents[0] !== null;

          if (isStructured) {
            // Display structured data (objects) as key-value pairs
            displayHtml = result.missingContents
              .map((item) => {
                let itemDetails = "";
                for (const key in item) {
                  if (Object.hasOwnProperty.call(item, key)) {
                    itemDetails += `<p><strong>${key}:</strong> <span>${item[key]}</span></p>`;
                  }
                }
                return `<div class="missing-item">${itemDetails}</div>`;
              })
              .join("");
          } else {
            // Display plain text data (strings) as simple lines
            displayHtml = result.missingContents
              .map((line) => {
                return `<div class="missing-item missing-item-line">${line}</div>`;
              })
              .join("");
          }
          missingContentsDisplay.innerHTML = displayHtml;
        } else {
          missingContentsDisplay.innerHTML = `
                  <p class="text-green-700 font-semibold">All items from File A were found in File B.</p>
                `;
        }
        // --- END: MODIFIED DISPLAY LOGIC FOR missingContents ---
      } else {
        downloadMissingSection.classList.add("hidden");
        missingContentsDisplay.innerHTML = `
                <p class="text-green-700 font-semibold">All items from File A were found in File B.</p>
              `;
      }
      resultsSection.classList.remove("hidden");
      showMessage(
        "Cross-check completed successfully! Download your file.",
        false
      );
    } else {
      showMessage(result.message);
    }
  } catch (error) {
    console.error("Cross-check error:", error);
    showMessage(`An error occurred: ${error.message}`);
  } finally {
    hideLoading();
  }
});
