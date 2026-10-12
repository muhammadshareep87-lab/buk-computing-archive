
"use strict";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const loginMessage = document.getElementById("loginMessage");

const uploadForm = document.getElementById("uploadForm");
const uploadMessage = document.getElementById("uploadMessage");
const uploadBtn = document.getElementById("uploadBtn");

const refreshBtn = document.getElementById("refreshBtn");
const documentsList = document.getElementById("documentsList");
const documentsMessage = document.getElementById("documentsMessage");

const DEPARTMENTS = {
  IFT: "Information Technology",
  COM: "Computer Science",
  CBS: "Cybersecurity",
  SWE: "Software Engineering"
};

function showMessage(element, message, success = false) {
  if (!element) return;
  element.textContent = message;
  element.style.color = success ? "#15803d" : "#b42318";
}

function showLogin() {
  loginSection.hidden = false;
  dashboardSection.hidden = true;
  logoutBtn.hidden = true;
}

function showDashboard() {
  loginSection.hidden = true;
  dashboardSection.hidden = false;
  logoutBtn.hidden = false;
}

async function getAccessToken() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    throw new Error("Your session has expired. Please log in again.");
  }

  return data.session.access_token;
}

async function apiRequest(url, options = {}) {
  const token = await getAccessToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || result.message || "Request failed.");
  }

  return result;
}

function getDocumentDepartments(doc) {
  const departments = Array.isArray(doc.departments) &&
      doc.departments.length
    ? doc.departments
    : [doc.department || doc.departmentCode || ""];

  return [...new Set(departments.filter((code) => DEPARTMENTS[code]))];
}

// ADMIN LOGIN
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const submitButton = loginForm.querySelector('button[type="submit"]');

  showMessage(loginMessage, "Logging in...");
  if (submitButton) submitButton.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data.session) throw new Error("Login failed. Please try again.");

    showDashboard();
    showMessage(loginMessage, "");
    await loadDocuments();
  } catch (error) {
    showLogin();
    showMessage(loginMessage, error.message || "Login failed.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// DOCUMENT LIST
async function loadDocuments() {
  documentsList.replaceChildren();
  showMessage(documentsMessage, "Loading documents...");

  try {
    const result = await apiRequest("/api/documents");
    const documents = Array.isArray(result)
      ? result
      : result.documents || [];

    if (!documents.length) {
      showMessage(documentsMessage, "No past questions uploaded yet.", true);
      return;
    }

    showMessage(documentsMessage, "");

    documents.forEach((doc) => {
      const card = document.createElement("div");
      card.className = "document-item";

      const title = document.createElement("h3");
      title.textContent = doc.title || "Untitled PDF";

      const details = document.createElement("p");
      const departments = getDocumentDepartments(doc);

      details.textContent = [
        departments.map((code) => DEPARTMENTS[code]).join(", "),
        doc.academicLevel || doc.academic_level || doc.level || "",
        doc.semester || "",
        doc.academicYear || doc.academic_year || doc.year || ""
      ].filter(Boolean).join(" • ");

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "View PDF";
      openButton.className = "secondary-btn";

      openButton.addEventListener("click", () => {
        if (doc.id) {
          window.open(
            "/api/pdf?id=" + encodeURIComponent(doc.id),
            "_blank",
            "noopener"
          );
        }
      });

      const removeLabel = document.createElement("label");
      removeLabel.textContent = "Remove from department:";

      const departmentSelect = document.createElement("select");
      departmentSelect.setAttribute(
        "aria-label",
        "Choose department to remove this PDF from"
      );

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select department";
      departmentSelect.appendChild(placeholder);

      departments.forEach((code) => {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = DEPARTMENTS[code];
        departmentSelect.appendChild(option);
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remove from Department";
      removeButton.className = "secondary-btn";

      removeButton.addEventListener("click", async () => {
        const department = departmentSelect.value;

        if (!department) {
          showMessage(documentsMessage, "Select a department first.");
          return;
        }

        const confirmed = window.confirm(
          `Remove "${doc.title}" from ${DEPARTMENTS[department]} only?`
        );

        if (!confirmed) return;

        removeButton.disabled = true;

        try {
          await apiRequest(
            "/api/documents?id=" + encodeURIComponent(doc.id) +
              "&department=" + encodeURIComponent(department),
            { method: "DELETE" }
          );

          showMessage(
            documentsMessage,
            "Removed from " + DEPARTMENTS[department] + ".",
            true
          );

          await loadDocuments();
        } catch (error) {
          showMessage(documentsMessage, error.message);
          removeButton.disabled = false;
        }
      });

      const deleteAllButton = document.createElement("button");
      deleteAllButton.type = "button";
      deleteAllButton.textContent = "Delete Everywhere";
      deleteAllButton.className = "delete-btn";

      deleteAllButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
          `Delete "${doc.title}" from ALL departments and delete its PDF permanently?`
        );

        if (!confirmed) return;

        deleteAllButton.disabled = true;

        try {
          await apiRequest(
            "/api/documents?id=" + encodeURIComponent(doc.id) + "&all=1",
            { method: "DELETE" }
          );

          showMessage(
            documentsMessage,
            "PDF deleted from all departments.",
            true
          );

          await loadDocuments();
        } catch (error) {
          showMessage(documentsMessage, error.message);
          deleteAllButton.disabled = false;
        }
      });

      card.append(
        title,
        details,
        openButton,
        removeLabel,
        departmentSelect,
        removeButton,
        deleteAllButton
      );

      documentsList.appendChild(card);
    });
  } catch (error) {
    showMessage(documentsMessage, error.message);
  }
}

// UPLOAD PDF
uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = document.getElementById("title").value.trim();
  const departments = [
    ...new Set(
      [...uploadForm.querySelectorAll(
        'input[name="departments"]:checked'
      )].map((input) => input.value)
    )
  ];

  const level = document.getElementById("level").value;
  const semester = document.getElementById("semester").value;
  const academicYear = document.getElementById("academicYear").value.trim();
  const file = document.getElementById("pdfFile").files[0];

  if (!title || !departments.length || !level || !semester || !file) {
    showMessage(
      uploadMessage,
      "Enter the title, select at least one department, level, semester and PDF."
    );
    return;
  }

  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    showMessage(uploadMessage, "Please select a PDF file.");
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    showMessage(uploadMessage, "PDF must not exceed 20 MB.");
    return;
  }

  uploadBtn.disabled = true;
  showMessage(uploadMessage, "Preparing secure upload...");

  let uploadedPath = null;
  let metadataSaved = false;

  try {
    const uploadInfo = await apiRequest("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: "application/pdf"
      })
    });

    if (!uploadInfo.path || !uploadInfo.token) {
      throw new Error("The server did not return a valid upload token.");
    }

    uploadedPath = uploadInfo.path;

    showMessage(uploadMessage, "Uploading PDF...");

    const { error: storageError } = await supabaseClient.storage
      .from("past-questions")
      .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, file, {
        contentType: "application/pdf",
        upsert: false
      });

    if (storageError) throw storageError;

    showMessage(uploadMessage, "Saving document details...");

    await apiRequest("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        departments,
        academicLevel: level,
        semester,
        academicYear,
        storagePath: uploadInfo.path
      })
    });

    metadataSaved = true;
    uploadForm.reset();

    showMessage(
      uploadMessage,
      "PDF uploaded successfully to: " +
        departments.map((code) => DEPARTMENTS[code]).join(", "),
      true
    );

    await loadDocuments();
  } catch (error) {
    showMessage(
      uploadMessage,
      error.message || "Upload failed. Please try again."
    );

    if (uploadedPath && !metadataSaved) {
      console.warn(
        "Upload may have succeeded without saved metadata. Check storage before retrying."
      );
    }
  } finally {
    uploadBtn.disabled = false;
  }
});

// REFRESH
refreshBtn.addEventListener("click", loadDocuments);

// LOGOUT
logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;

  try {
    await supabaseClient.auth.signOut();
  } finally {
    showLogin();
    uploadForm.reset();
    documentsList.replaceChildren();
    showMessage(loginMessage, "You have logged out.", true);
    logoutBtn.disabled = false;
  }
});

// RESTORE SESSION
async function initializeAdmin() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    showLogin();
    return;
  }

  showDashboard();
  await loadDocuments();
}

initializeAdmin();
