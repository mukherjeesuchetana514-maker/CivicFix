# Requirements Specification - CivicFix

## 1. Introduction
### 1.1 Purpose
CivicFix is a Progressive Web App (PWA) designed to bridge the communication gap between citizens and municipal authorities. It enables real-time, AI-verified reporting of civic hazards like potholes, garbage, and waterlogging.

### 1.2 Scope
The system consists of two primary modules:
* **Citizen Module (Lite Mode):** A mobile-first interface for reporting issues.
* **Official Module (Dashboard Mode):** A desktop-optimized dashboard for authorities to view and manage reports.

## 2. User Personas
* **Citizen:** A local resident who wants to report civic issues quickly without navigating complex bureaucratic procedures.
* **Municipal Official:** A government employee responsible for monitoring and resolving civic issues in specific zones.

## 3. Functional Requirements

### 3.1 Citizen Module (Lite Mode)
* **REQ-CIT-01: One-Tap Reporting**
    * Users must be able to capture or upload a photo of a hazard.
    * The system must automatically retrieve GPS coordinates (Latitude/Longitude).
* **REQ-CIT-02: AI Verification**
    * The system must use Google Gemini API to analyze the uploaded image.
    * The AI must verify the hazard type (e.g., "Pothole", "Garbage") before submission.
    * Invalid images must be rejected to prevent spam.
* **REQ-CIT-03: Image Compression**
    * Images must be compressed client-side to ~400px width to optimize data usage on low-bandwidth networks.
* **REQ-CIT-04: Gamification**
    * Users shall earn "Civic Points" for every verified report submitted.

### 3.2 Official Module (Dashboard Mode)
* **REQ-OFF-01: Authentication**
    * Officials must log in via secure authentication to access the dashboard.
* **REQ-OFF-02: Heatmap Visualization**
    * The dashboard must display a map with markers for all active reports.
    * Markers must use color coding: Red (Pending) and Green (Resolved).
* **REQ-OFF-03: Zone Filtering**
    * Officials must be able to filter reports based on specific administrative zones (e.g., "Howrah Zone 1").
* **REQ-OFF-04: Status Updates**
    * Officials must be able to change the status of a report from `Pending` -> `In Progress` -> `Resolved`.
    * The system must record the timestamp of the resolution.

## 4. Non-Functional Requirements
* **NFR-01: Performance:** The Citizen module must load in under 3 seconds on 4G networks.
* **NFR-02: Compatibility:** The app must be fully responsive (Mobile, Tablet, Desktop).
* **NFR-03: Security:** API keys (Gemini/Firebase) must be secured, and user data must be protected via Firebase Security Rules.
* **NFR-04: Scalability:** The backend must handle simultaneous reporting requests without downtime.

## 5. Technology Stack
* **Frontend:** HTML5, CSS3, Vanilla JavaScript.
* **AI Engine:** Google Gemini API (Model: `gemini-flash-latest`).
* **Backend/Database:** Firebase Authentication, Cloud Firestore.
* **Mapping:** Leaflet.js, OpenStreetMap.
