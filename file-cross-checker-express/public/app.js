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
  messageBox.classList.add("show");
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
 */
function showLoading(text = "Processing...") {
  buttonText.textContent = text;
  loadingSpinner.classList.remove("hidden");
  loadingSpinner.classList.add("show");
  crossCheckBtn.disabled = true;
  file1Input.disabled = true;
  file2Input.disabled = true;
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
}

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

  if (!file1 || !file2) {
    showMessage("Please select both File A and File B.");
    return;
  }

  showLoading("Cross-Checking, PLEASE WAIT🙏...");

  const formData = new FormData();
  formData.append("fileA", file1);
  formData.append("fileB", file2);

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
      showMessage("Cross-check completed successfully!", false);
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
