
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

// ADMIN LOGIN
loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const submitButton = loginForm.querySelector(
    'button[type="submit"]'
  );

  showMessage(loginMessage, "Logging in...");

  if (submitButton) submitButton.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if (!data.session) {
      throw new Error("Login failed. Please try again.");
    }

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

// LOAD DOCUMENTS
async function loadDocuments() {
  documentsList.replaceChildren();
  showMessage(documentsMessage, "Loading documents...");

  try {
    const result = await apiRequest("/api/documents");
    const documents = Array.isArray(result)
      ? result
      : result.documents || [];

    if (documents.length === 0) {
      showMessage(documentsMessage, "No past questions uploaded yet.", true);
      return;
    }

    showMessage(documentsMessage, "");

    documents.forEach(function (doc) {
      const card = document.createElement("div");
      card.className = "document-item";

      const title = document.createElement("h3");
      title.textContent = doc.title || "Untitled PDF";

      const details = document.createElement("p");
      details.textContent = [
        doc.department || doc.departmentCode || "",
        doc.academic_level || doc.level || doc.academicLevel || "",
        doc.semester || "",
        doc.academic_year || doc.year || ""
      ].filter(Boolean).join(" • ");

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "View PDF";
      openButton.className = "secondary-btn";

      openButton.addEventListener("click", function () {
        if (doc.id) {
          window.open(
            "/api/pdf?id=" + encodeURIComponent(doc.id),
            "_blank",
            "noopener"
          );
        }
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.className = "delete-btn";

      deleteButton.addEventListener("click", async function () {
        const confirmed = window.confirm(
          `Are you sure you want to delete "${doc.title}"?`
        );

        if (!confirmed) return;

        deleteButton.disabled = true;

        try {
          await apiRequest(
            "/api/documents?id=" + encodeURIComponent(doc.id),
            { method: "DELETE" }
          );

          card.remove();
          showMessage(documentsMessage, "Document deleted successfully.", true);
        } catch (error) {
          showMessage(documentsMessage, error.message);
          deleteButton.disabled = false;
        }
      });

      card.append(title, details, openButton, deleteButton);
      documentsList.appendChild(card);
    });
  } catch (error) {
    showMessage(documentsMessage, error.message);
  }
}

// UPLOAD PDF
uploadForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const title = document.getElementById("title").value.trim();
  const department = document.getElementById("department").value;
  const level = document.getElementById("level").value;
  const semester = document.getElementById("semester").value;
  const academicYear = document.getElementById("academicYear").value.trim();
  const file = document.getElementById("pdfFile").files[0];

  if (!title || !department || !level || !semester || !file) {
    showMessage(uploadMessage, "Please complete all required fields.");
    return;
  }

  if (file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")) {
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

  try {
    // Ask the backend for a temporary upload token.
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

    // Upload directly to the private Supabase bucket.
    const { error: storageError } = await supabaseClient.storage
      .from("past-questions")
      .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, file, {
        contentType: "application/pdf",
        upsert: false
      });

    if (storageError) throw storageError;

    showMessage(uploadMessage, "Saving document details...");

    // Save metadata through the protected backend.
    await apiRequest("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        department,
        academicLevel: level,
        semester,
        academicYear,
        storagePath: uploadInfo.path
      })
    });

    uploadForm.reset();
    showMessage(uploadMessage, "PDF uploaded successfully.", true);

    await loadDocuments();
  } catch (error) {
    showMessage(
      uploadMessage,
      error.message || "Upload failed. Please try again."
    );

    // If the file uploaded but saving its details failed,
    // the backend may need to clean up the unused file.
    if (uploadedPath) {
      console.warn(
        "An upload may need cleanup if saving metadata failed."
      );
    }
  } finally {
    uploadBtn.disabled = false;
  }
});

// REFRESH DOCUMENTS
refreshBtn.addEventListener("click", loadDocuments);

// LOGOUT
logoutBtn.addEventListener("click", async function () {
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

// CHECK EXISTING SESSION
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
