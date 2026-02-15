# System Design Document - CivicFix

## 1. High-Level Architecture
CivicFix follows a **Serverless Architecture** relying on client-side logic and cloud-based services.

* **Client (Browser):** Handles UI rendering, Image Compression, and Geolocation.
* **AI Service (Google Gemini):** Direct API calls from the client to verify image content.
* **Backend (Firebase):** Manages Authentication and NoSQL Database (Firestore).
* **Map Service:** Leaflet.js rendering OpenStreetMap tiles.

## 2. Data Model (Firestore Schema)

### Collection: `users`
| Field | Type | Description |
| :--- | :--- | :--- |
| `uid` | String | Unique Firebase Auth ID |
| `email` | String | User email address |
| `role` | String | "citizen" or "official" |
| `zone` | String | (Official only) Assigned jurisdiction |
| `civicPoints` | Number | (Citizen only) Gamification score |

### Collection: `reports`
| Field | Type | Description |
| :--- | :--- | :--- |
| `reportId` | String | Unique Report ID |
| `imageUrl` | String | URL of the uploaded image |
| `latitude` | Number | GPS Latitude |
| `longitude` | Number | GPS Longitude |
| `category` | String | AI-detected category (e.g., "Pothole") |
| `status` | String | "Pending", "In Progress", "Resolved" |
| `timestamp` | Timestamp | Time of submission |
| `userId` | String | ID of the reporter |

## 3. Component Design

### 3.1 Logic.js (Core Controller)
The `logic.js` file serves as the central controller for the application, handling:
1.  **DOM Manipulation:** Toggling between Lite Mode (Citizen) and Dashboard (Official).
2.  **AI Integration:** Constructing the payload for the Gemini API and parsing the JSON response.
3.  **Firebase Interaction:** Reading/Writing to Firestore `reports` collection.

### 3.2 AI Verification Flow
1.  User captures image -> `logic.js` resizes image.
2.  Base64 image sent to `Gemini API`.
3.  Gemini responds with classification (e.g., `{ "hazard": true, "type": "garbage" }`).
4.  If valid, `logic.js` uploads data to Firestore.
5.  If invalid, user receives an error alert.

## 4. User Interface Design
* **Mobile View:** Minimalist card-based layout. Large "Camera" button for accessibility.
* **Desktop View:** Split-screen layout. Left sidebar for statistics/filters, right panel for the interactive map.

## 5. Security & Privacy
* **Data Minimization:** Only essential location data is stored.
* **Role-Based Access:** Firestore rules ensure Citizens can only read their own reports (or public feed), while Officials can write status updates.
