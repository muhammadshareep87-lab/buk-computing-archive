
"use strict";

/* =========================================
   DAN BAIWA TECH
   FACULTY OF COMPUTING PAST QUESTIONS
========================================= */

const API_URL = "/api/documents";
const PDF_URL = "/api/pdf";

const DEPARTMENTS = {
    IFT: { name: "Information Technology", code: "IFT" },
    COM: { name: "Computer Science", code: "COM" },
    CBS: { name: "Cybersecurity", code: "CBS" },
    SWE: { name: "Software Engineering", code: "SWE" }
};

const LEVEL_BY_YEAR = {
    "25": "Level 100",
    "24": "Level 200",
    "23": "Level 300",
    "22": "Level 400"
};

const SEMESTERS = ["First Semester", "Second Semester"];

const form = document.getElementById("regFinderForm");
const registrationInput = document.getElementById("registrationNumber");
const finderMessage = document.getElementById("finderMessage");
const departmentSection = document.getElementById("departments");
const departmentTitle = document.getElementById("studentDepartmentTitle");
const departmentDescription = document.getElementById("studentDepartmentDescription");
const departmentContent = document.getElementById("studentDepartmentContent");
const currentYear = document.getElementById("currentYear");

let documents = [];
let documentsLoaded = false;
let documentsError = false;

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}

/* =========================================
   HELPER FUNCTIONS
========================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (character) {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character];
    });
}

function showFinderMessage(message, type = "info") {
    finderMessage.textContent = message;
    finderMessage.className = "finder-message " + type;
}

function normalizeDepartment(value) {
    const text = String(value ?? "").trim().toUpperCase();

    if (DEPARTMENTS[text]) {
        return text;
    }

    const found = Object.entries(DEPARTMENTS).find(function ([code, item]) {
        return item.name.toUpperCase() === text;
    });

    return found ? found[0] : "";
}

/* Read one or multiple departments from a document */
function getDocumentDepartments(document) {
    const values = [];

    if (Array.isArray(document.departments)) {
        values.push(...document.departments);
    }

    if (document.departmentCode) values.push(document.departmentCode);
    if (document.department) values.push(document.department);
    if (document.department_code) values.push(document.department_code);

    return [...new Set(values.map(normalizeDepartment).filter(Boolean))];
}

function normalizeLevel(value) {
    const text = String(value ?? "").trim().toLowerCase();
    const match = text.match(/(?:level\s*)?(\d{3})/);

    return match ? "Level " + match[1] : "";
}

function normalizeSemester(value) {
    const text = String(value ?? "").trim().toLowerCase();

    if (["1", "first", "first semester", "semester 1"].includes(text)) {
        return "First Semester";
    }

    if (["2", "second", "second semester", "semester 2"].includes(text)) {
        return "Second Semester";
    }

    return "";
}

function showDepartmentSection() {
    departmentSection.hidden = false;
    departmentSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

/* =========================================
   REGISTRATION NUMBER VALIDATION
========================================= */

function findDepartmentFromRegistration(registrationNumber) {
    const value = String(registrationNumber ?? "").trim().toUpperCase();

    const pattern = /^CST\/(22|23|24|25)\/(IFT|CBS|COM|SWE)\/(\d{5})$/;
    const match = value.match(pattern);

    if (!match) {
        return {
            valid: false,
            message: "Invalid registration number. Use the format CST/24/IFT/00001."
        };
    }

    const year = match[1];
    const departmentCode = match[2];
    const serialNumber = Number(match[3]);

    if (serialNumber < 1 || serialNumber > 10000) {
        return {
            valid: false,
            message: "The registration number must end with a number from 00001 to 10000."
        };
    }

    return {
        valid: true,
        registrationNumber: value,
        departmentCode,
        department: DEPARTMENTS[departmentCode],
        level: LEVEL_BY_YEAR[year]
    };
}

/* =========================================
   LOAD DOCUMENTS FROM BACKEND
========================================= */

async function loadDocuments() {
    try {
        const response = await fetch(API_URL, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error("Unable to load documents.");
        }

        const result = await response.json();
        const list = Array.isArray(result) ? result : result.documents;

        if (!Array.isArray(list)) {
            throw new Error("Invalid documents response.");
        }

        documents = list;
        documentsLoaded = true;
        documentsError = false;
    } catch (error) {
        console.error("Documents loading error:", error);
        documents = [];
        documentsLoaded = false;
        documentsError = true;
    }
}

/* =========================================
   FILTER DOCUMENTS
========================================= */

function getDocumentsForSemester(department, level, semester) {
    return documents.filter(function (document) {
        const documentDepartments = getDocumentDepartments(document);

        const documentLevel = normalizeLevel(
            document.level ??
            document.academicLevel ??
            document.academic_level
        );

        const documentSemester = normalizeSemester(document.semester);

        return (
            documentDepartments.includes(department) &&
            documentLevel === level &&
            documentSemester === semester
        );
    });
}

/* =========================================
   CREATE DOCUMENT HTML
========================================= */

function createDocumentHTML(document) {
    const id = String(document.id ?? "").trim();

    if (!id) return "";

    const title = escapeHTML(
        document.title ||
        document.name ||
        document.fileName ||
        document.file_name ||
        "Past Question PDF"
    );

    const year = escapeHTML(
        document.year ||
        document.academicYear ||
        document.academic_year ||
        "Past Question"
    );

    const pdfUrl = PDF_URL + "?id=" + encodeURIComponent(id);

    return `
        <article class="document-item">
            <div class="document-info">
                <div class="pdf-icon">PDF</div>
                <div>
                    <h4>${title}</h4>
                    <p>${year}</p>
                </div>
            </div>

            <div class="document-actions">
                <a class="document-link"
                   href="${pdfUrl}"
                   target="_blank"
                   rel="noopener noreferrer">
                    View PDF
                </a>

                <a class="document-link download"
                   href="${pdfUrl}&download=1">
                    Download
                </a>
            </div>
        </article>
    `;
}

/* =========================================
   SEMESTER DISPLAY
========================================= */

function createComingSoonHTML() {
    return `
        <div class="coming-soon">
            <strong>Coming Soon</strong>
            <p>
                Past questions for this semester will be available
                when the PDF is uploaded.
            </p>
        </div>
    `;
}

function createSemesterHTML(department, level, semester) {
    const semesterDocuments = getDocumentsForSemester(
        department,
        level,
        semester
    );

    let content = "";

    if (semesterDocuments.length > 0) {
        content = `
            <div class="document-list">
                ${semesterDocuments.map(createDocumentHTML).join("")}
            </div>
        `;
    } else if (documentsError) {
        content = `
            <div class="empty-message">
                We could not load the past questions right now.
                Please try again later.
            </div>
        `;
    } else if (level === "Level 400") {
        content = createComingSoonHTML();
    } else {
        content = `
            <div class="empty-message">
                No past questions are available for this semester yet.
            </div>
        `;
    }

    return `
        <div class="semester-block">
            <h4 class="semester-title">${escapeHTML(semester)}</h4>
            ${content}
        </div>
    `;
}

/* =========================================
   DISPLAY A LEVEL AND BOTH SEMESTERS
========================================= */

function createLevelHTML(departmentCode, level) {
    const department = DEPARTMENTS[departmentCode];

    return `
        <article class="level-card">
            <div class="level-card-header">
                <h3>${escapeHTML(level)}</h3>
                <p>
                    Department: ${escapeHTML(department.name)}
                    (${escapeHTML(department.code)})
                </p>
            </div>

            ${SEMESTERS.map(function (semester) {
                return createSemesterHTML(departmentCode, level, semester);
            }).join("")}
        </article>
    `;
}

/* =========================================
   SHOW THE STUDENT'S DEPARTMENT
========================================= */

async function showDepartmentPastQuestions(
    departmentCode,
    studentLevel,
    registrationNumber
) {
    const department = DEPARTMENTS[departmentCode];

    if (!department || !studentLevel) {
        showFinderMessage(
            "We could not identify the department or academic level.",
            "error"
        );
        return;
    }

    departmentTitle.textContent = department.name;

    departmentDescription.textContent =
        "Registration Number: " + registrationNumber +
        " | " + studentLevel +
        " | " + department.code;

    departmentContent.innerHTML = `
        <div class="loading-message">Loading past questions...</div>
    `;

    showDepartmentSection();

    await loadDocuments();

    departmentContent.innerHTML = `
        <div class="level-grid">
            ${createLevelHTML(departmentCode, studentLevel)}
        </div>
    `;

    if (documentsError) {
        showFinderMessage(
            "Your department was identified, but the document service could not be reached.",
            "info"
        );
    } else {
        showFinderMessage(
            "Department identified. Your available semester resources are shown below.",
            "success"
        );
    }
}

/* =========================================
   FORM SUBMISSION
========================================= */

if (form) {
    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const registrationNumber = registrationInput.value.trim().toUpperCase();
        registrationInput.value = registrationNumber;

        const result = findDepartmentFromRegistration(registrationNumber);

        if (!result.valid) {
            departmentSection.hidden = true;
            departmentContent.innerHTML = "";
            showFinderMessage(result.message, "error");
            return;
        }

        showFinderMessage("Checking your registration number...", "info");

        await showDepartmentPastQuestions(
            result.departmentCode,
            result.level,
            result.registrationNumber
        );
    });
}

/* =========================================
   INITIAL PAGE SETUP
========================================= */

if (departmentSection) {
    departmentSection.hidden = true;
}
