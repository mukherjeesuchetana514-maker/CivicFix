import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc, query, where, increment, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// ============================================
// 🛑 YOUR FIREBASE KEYS (Preserved)
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyCV9_BVsNRw3WREubkBEvRqRzN33_nOW6Y",
  authDomain: "civicfix-55318.firebaseapp.com",
  projectId: "civicfix-55318",
  storageBucket: "civicfix-55318.firebasestorage.app",
  messagingSenderId: "801249186002",
  appId: "1:801249186002:web:ba73e0bc2685450e80dd0b",
  measurementId: "G-SGFRJBWRE2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Variables
const cameraInput = document.getElementById('cameraInput');
const preview = document.getElementById('preview');
const reportBtn = document.getElementById('reportBtn');
const loading = document.getElementById('loading');
const resultDiv = document.getElementById('result');
const aiText = document.getElementById('aiText');
let fileToAnalyze = null;
let currentUser = null;
let currentLoginType = 'citizen';

// ============================================
// 🟢 SESSION RESTORER (Keeps you logged in!)
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in, restore the session
        currentUser = user;
        
        // Check if it's an official or citizen
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            currentUser.role = userData.role;
            currentUser.org = userData.org || "";
            currentUser.zone_name = userData.zone_name || ""; // Ensure zone_name is restored
            
            // Restore UI based on role
            if (userData.role === 'official') {
                currentLoginType = 'official';
                document.getElementById('nav-citizen').style.display = 'none';
                document.getElementById('nav-official').style.display = 'flex';
                document.getElementById('org-name-display').innerText = `🏛️ ${userData.org || userData.zone_name}`;
            } else {
                currentLoginType = 'citizen';
                document.getElementById('loginBtn').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'block';
                
                // Update Points in Navbar
                const pointsEl = document.getElementById("civic-points");
                if (pointsEl) {
                    pointsEl.innerText = userData.civicPoints || 0;
                }
            }
        }
        console.log("Session restored for:", user.email);
    } else {
        // User is signed out
        currentUser = null;
        console.log("No user signed in.");
    }
});

// ============================================
// 1. UI HELPERS (Cool Popups & Toggles)
// ============================================

const showPopup = (title, text, icon) => {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: title,
            text: text,
            icon: icon, // 'success', 'error', 'warning', 'info'
            confirmButtonColor: '#198754',
            borderRadius: '20px'
        });
    } else {
        alert(`${title}: ${text}`); // Fallback if Swal isn't loaded
    }
};

window.forgotPassPopup = () => {
    Swal.fire({
        title: 'Reset Password',
        input: 'email',
        inputPlaceholder: 'Enter your email address',
        showCancelButton: true,
        confirmButtonText: 'Send Link',
        confirmButtonColor: '#198754',
    }).then((result) => {
        if (result.isConfirmed) {
            handleReset(result.value);
        }
    });
};

// HELPER: Open Image safely without redirecting
window.openImage = function(imgData) {
    if(!imgData || imgData === '#' || imgData.length < 100) {
        showPopup("No Image", "This report has no valid image.", "info");
        return;
    }
    const w = window.open("");
    w.document.write(`<img src="${imgData}" style="width:100%; max-width:800px;">`);
}

// 🟢 NEW FIX: COMPRESS IMAGE TO FIT IN DATABASE
const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; // Resize to max 800px width
            const scaleSize = MAX_WIDTH / img.width;
            
            // Only resize if bigger than MAX_WIDTH
            if (img.width > MAX_WIDTH) {
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Compress to JPEG at 0.6 (60%) quality
            resolve(canvas.toDataURL('image/jpeg', 0.6)); 
        }
        img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
});

// 🌟 TOGGLE LOGIN TYPE (Design Logic)
window.setLoginType = function(type) {
    currentLoginType = type;
    const btn = document.getElementById('loginSubmitBtn');
    const orgInput = document.getElementById('orgInputGroup');
    const createLink = document.getElementById('createAccountLink');
    const tabCitizen = document.getElementById('tab-citizen');
    const tabOfficial = document.getElementById('tab-official');

    if (type === 'official') {
        // OFFICIAL STYLE
        btn.innerText = "Login to Dashboard";
        btn.className = "btn btn-dark-official w-100 rounded-pill py-3 fw-bold shadow-sm"; 
        orgInput.style.display = 'block'; 
        createLink.style.display = 'block'; 
        
        tabCitizen.classList.remove('active');
        tabOfficial.classList.add('active');
    } else {
        // CITIZEN STYLE
        btn.innerText = "Login as Citizen";
        btn.className = "btn btn-enchanting w-100 rounded-pill py-3 fw-bold shadow-sm"; 
        orgInput.style.display = 'none';
        createLink.style.display = 'block'; 
        
        tabCitizen.classList.add('active');
        tabOfficial.classList.remove('active');
    }
}

// 🟢 PREPARE SIGNUP MODAL (Handles Official vs Citizen Layout)
window.prepareSignupModal = function() {
    const orgGroup = document.getElementById('signupOrgGroup');
    const title = document.getElementById('signupTitle');
    const btn = document.getElementById('signupSubmitBtn');

    if (currentLoginType === 'official') {
        orgGroup.style.display = 'block';
        title.innerText = "Official Registration 🏛️";
        btn.innerText = "Create Official Account";
        btn.className = "btn btn-dark-official w-100 rounded-pill py-3 fw-bold";
    } else {
        orgGroup.style.display = 'none';
        title.innerText = "Join the Movement 🌍";
        btn.innerText = "Create Citizen Account";
        btn.className = "btn btn-enchanting w-100 rounded-pill py-3 fw-bold";
    }
}

// Navigation Helper
window.showSection = function(sectionId) {
    document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    const navbarToggler = document.querySelector('.navbar-toggler');
    const navbarCollapse = document.querySelector('.navbar-collapse');
    if(navbarCollapse.classList.contains('show')) navbarToggler.click();
}

window.loadLeaderboard = async function() {
    const tableBody = document.getElementById('leaderboard-body');
    if (!tableBody) return;

    // Show loading state
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Loading top contributors...</td></tr>';

    try {
        let q;

        // 1. IF OFFICIAL: Filter by their Zone (Municipality/Panchayat)
        if (currentUser && currentUser.role === 'official' && currentUser.zone_name) {
            
            // Query: Get citizens in THIS zone, sorted by points
            q = query(
                collection(db, "users"),
                where("role", "==", "citizen"),
                where("zone_name", "==", currentUser.zone_name), // <--- FILTER BY TERRITORY
                orderBy("civicPoints", "desc"),
                limit(10)
            );

        } else {
            // 2. IF CITIZEN/GUEST: Show Global Top 10 (or you can filter by their zone too)
            q = query(
                collection(db, "users"),
                where("role", "==", "citizen"),
                orderBy("civicPoints", "desc"),
                limit(10)
            );
        }

        const querySnapshot = await getDocs(q);
        let rowsHtml = '';

        if (querySnapshot.empty) {
            rowsHtml = `<tr><td colspan="4" class="text-center p-4 text-muted">No contributors found in this area yet.</td></tr>`;
        } else {
            let rank = 1;
            querySnapshot.forEach((doc) => {
                const user = doc.data();
                
                // 3. GENERATE ROW (Showing Email in the last column)
                rowsHtml += `
                    <tr>
                        <td class="p-3 fw-bold">#${rank++}</td>
                        <td class="p-3">
                            <div class="d-flex align-items-center">
                                <div class="bg-light rounded-circle d-flex align-items-center justify-content-center me-2" style="width: 35px; height: 35px;">
                                    <i class="bi bi-person-fill text-secondary"></i>
                                </div>
                                ${user.name}
                            </div>
                        </td>
                        <td class="p-3">
                            <span class="badge bg-warning text-dark rounded-pill px-3">
                                🏆 ${user.civicPoints || 0}
                            </span>
                        </td>
                        <td class="p-3 text-muted small">
                            <i class="bi bi-envelope-at me-1"></i> ${user.email}
                        </td>
                    </tr>
                `;
            });
        }

        tableBody.innerHTML = rowsHtml;

    } catch (error) {
        console.error("Error loading leaderboard:", error);
        
        // Firebase Index Error Handling (Common when filtering by multiple fields)
        if (error.message.includes("index")) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger p-3">
                ⚠️ System Config Error: Missing Database Index.<br>
                <small>Open browser console for the link to create it.</small>
            </td></tr>`;
        } else {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger p-3">Error loading data.</td></tr>`;
        }
    }
}

let map; // Global variable to hold the map instance

window.initMap = async function() {
    // 1. If map already exists, just resize it (fixes display bugs)
    if (map) {
        setTimeout(() => map.invalidateSize(), 100);
        return;
    }

    // 2. Initialize Map (Default view: India Center, you can change coords)
    map = L.map('civicMap').setView([22.75, 88.34], 13); 

    // 3. Add OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 4. Fetch Reports and Add Markers
    try {
        // Query reports for the logged-in official's territory
        const q = query(
            collection(db, "reports"), 
            where("zone_name", "==", currentUser.zone_name) 
        );
        
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showPopup("No Data", "No reports found for the map.", "info");
        }

        querySnapshot.forEach((doc) => {
            const report = doc.data();
            
            // CHECK: Only add marker if report has location data
            if (report.location && report.location.lat && report.location.lng) {
                
                // Customize Icon (Optional: Red for pending, Green for solved)
                const markerColor = report.status === 'Solved' ? 'green' : 'red';
                
                // Add Marker
                const marker = L.marker([report.location.lat, report.location.lng]).addTo(map);
                
                // Add Popup with Info
                marker.bindPopup(`
                    <b>Issue:</b> ${report.issue_text}<br>
                    <b>Status:</b> <span style="color:${markerColor}">${report.status}</span><br>
                    <small>${new Date(report.timestamp).toLocaleDateString()}</small><br>
                    <img src="${report.imageUrl}" style="width:100px; margin-top:5px; border-radius:5px;">
                `);
            }
        });

    } catch (error) {
        console.error("Error loading map data:", error);
    }
}

// 🔒 PROTECTED ROUTE CHECKER
window.checkAuthAndShow = function(sectionId) {
    if (!currentUser) {
        showPopup("Access Restricted", "Please Login or Create an Account to report issues.", "warning");
        const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
        loginModal.show();
    } else {
        showSection(sectionId);
        // IF USER OPENS 'MY REPORTS', LOAD THEIR DATA
        if(sectionId === 'user-dashboard-section') {
            loadUserDashboard();
        }
        // 🟢 IF USER OPENS 'TOP CONTRIBUTORS', LOAD LEADERBOARD
        if(sectionId === 'leaderboard-section') {
            loadLeaderboard();
        }
    }
}

// ============================================
// 2. CAMERA PREVIEW & AI LOGIC
// ============================================
if(cameraInput) {
    cameraInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileToAnalyze = file;
            preview.src = URL.createObjectURL(file);
            preview.style.display = 'block';
            reportBtn.style.display = 'block';
        }
    });
}

// Load TensorFlow Model
let tfModel = null;
if (typeof cocoSsd !== 'undefined') {
    cocoSsd.load().then(loadedModel => {
        tfModel = loadedModel;
        console.log("⚡ TensorFlow Edge Model Loaded!");
    }).catch(err => {
        console.log("TensorFlow failed to load:", err);
    });
}


// function that add civic point 
async function addCivicPoints(user, points = 10) {
    if (!user) return;
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const currentPoints = userSnap.data().civicPoints || 0;
            await updateDoc(userRef, {
                civicPoints: currentPoints + points
            });
        }
    } catch (e) {
        console.log("Error adding points:", e);
    }
}

// Report Action (Optimized for Speed)
// Report Action (Smart GPS with Retry)
if(reportBtn) {
    reportBtn.addEventListener('click', async () => {
        if (!fileToAnalyze) return;

        // UI Updates
        loading.style.display = 'block';
        reportBtn.disabled = true;
        reportBtn.innerText = "Locating..."; 

        // 1. Success Callback (Shared for both attempts)
        const onLocationFound = async (position) => {
            reportBtn.innerText = "Analyzing...";
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            try {
                // 1. COMPRESS IMAGE
                const compressedImage = await compressImage(fileToAnalyze);

                // 2. EDGE AI
                let tfResultText = "No obstacles detected.";
                if (window.tfModel) { // Changed to window.tfModel to be safe
                    try {
                        const imgForTf = document.getElementById('preview');
                        const predictions = await window.tfModel.detect(imgForTf);
                        if (predictions.length > 0) {
                            const objects = predictions.map(p => p.class).join(", ");
                            tfResultText = `Found: ${objects}`;
                        }
                    } catch(e) { console.log("TF Skipped", e); }
                }

                // 3. BACKEND AI
                const formData = new FormData();
                formData.append("image", fileToAnalyze);
                const response = await fetch('/api/analyze', { method: 'POST', body: formData });
                const data = await response.json();
                if(data.error) throw new Error(data.error);
                const geminiText = data.result;

                // 4. SAVE TO FIREBASE
                const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
                
                await addDoc(collection(db, "reports"), {
                    issue: geminiText,
                    imageUrl: compressedImage,
                    tf_detection: tfResultText,
                    severity: "High",
                    status: "Pending",
                    adminComment: "",
                    location: { lat: lat, lng: lng },
                    zone_name: currentUser.zone_name || "Unknown",
                    googleMapsLink: mapUrl,
                    timestamp: serverTimestamp(),
                    userEmail: currentUser ? currentUser.email : "Anonymous"
                });

                if (currentUser && currentUser.uid) {
                    await addCivicPoints(currentUser, 10);
                }

                try {
                    const pointsEl = document.getElementById("civic-points");
                    if(pointsEl) pointsEl.innerText = (parseInt(pointsEl.innerText) || 0) + 10;
                } catch (e) {}

                aiText.innerHTML = `
                    <div class="alert alert-secondary py-1 mb-2" style="font-size:0.9em">⚡ <strong>Edge AI:</strong> ${tfResultText}</div>
                    <strong>Analysis:</strong> ${geminiText}<br><br>
                    📍 <strong>Location:</strong> <a href="${mapUrl}" target="_blank" style="color:var(--primary-color); font-weight:bold;">View Map</a>
                    <p style="color:rgb(20,231,20); font-weight: bolder;">CONGRATULATIONS!!!!</P>
                    <p>YOU GAIN 10 CIVIC POINTS</p>
                `;
                
                loading.style.display = 'none';
                resultDiv.style.display = 'block';
                showPopup("Report Sent!", "+10 Points Added!", "success");
                
                reportBtn.innerText = "Report Issue";
                reportBtn.disabled = false;

            } catch (error) {
                console.error("Error:", error);
                loading.style.display = 'none';
                showPopup("Error", "Analysis Failed: " + error.message, "error");
                reportBtn.innerText = "Report Issue";
                reportBtn.disabled = false;
            }
        };

        // 2. Final Error Callback
        const onLocationError = (err) => {
            console.warn("GPS Final Error", err);
            loading.style.display = 'none';
            // Show alert specifically about permissions
            alert("Could not get location. Please ensure GPS is ON and browser permission is allowed.");
            reportBtn.disabled = false;
            reportBtn.innerText = "Report Issue";
        };

        // 🟢 3. SMART EXECUTION (The Fix)
        if ("geolocation" in navigator) {
            // Attempt 1: High Accuracy (Wait 5s)
            navigator.geolocation.getCurrentPosition(
                onLocationFound, 
                (err) => {
                    console.log("High Accuracy failed. Retrying with Low Accuracy...");
                    
                    // Attempt 2: Low Accuracy (Reliable fallback if High fails)
                    navigator.geolocation.getCurrentPosition(
                        onLocationFound,
                        onLocationError,
                        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
                    );
                }, 
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
            );
        } else {
            showPopup("Error", "Geolocation not supported.", "error");
            loading.style.display = 'none';
            reportBtn.disabled = false;
        }
    });
}

// ============================================
// 3. AUTHENTICATION HANDLERS
// ============================================

// A. HANDLE LOGIN
window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    
    // Determine which tab is active (Citizen or Official)
    const isOfficialTab = document.getElementById('tab-official') && document.getElementById('tab-official').classList.contains('active');
    const role = isOfficialTab ? 'official' : 'citizen';
    
    // UI Feedback
    const btn = document.getElementById('loginSubmitBtn');
    const originalText = btn.innerText;
    btn.innerText = "Verifying...";
    btn.disabled = true;

    try {
        // 🟢 1. CALL YOUR PYTHON BACKEND
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: email, 
                password: pass, 
                role: role 
            })
        });

        const data = await response.json();

        // 🟢 2. HANDLE SUCCESS OR ERROR
        if (data.status === 'success') {
            
            // ✅ CRITICAL FIX: Save the Zone Name from the backend
            currentUser = {
                uid: data.user_id,
                name: data.name,
                email: email,
                role: data.role,
                zone_name: data.zone_name, // This fixes the "undefined" error
                zone_type: data.zone_type
            };
            
            // Save to browser memory (so refresh doesn't log you out)
            localStorage.setItem('user', JSON.stringify(currentUser));

            // Close Modal
            const modalEl = document.getElementById('loginModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if(modal) modal.hide();

            showPopup("Welcome!", `Logged in as ${data.role}`, "success");

            // 🟢 3. UI UPDATES BASED ON ROLE
            if (currentUser.role === 'official') {
                // Show Official Nav
                document.getElementById('nav-citizen').style.display = 'none';
                document.getElementById('nav-official').style.display = 'flex';
                
                // Show Municipality Name in Top Right
                const orgDisplay = document.getElementById('org-name-display');
                if(orgDisplay) orgDisplay.innerText = `🏛️ ${currentUser.zone_name}`;

                // Load Dashboard
                showSection('admin-section');
                if(window.loadDashboard) window.loadDashboard();
                
            } else {
                // Show Citizen Nav
                document.getElementById('nav-citizen').style.display = 'flex';
                document.getElementById('nav-official').style.display = 'none';
                
                document.getElementById('loginBtn').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'block';

                showSection('home-section');
                
                // Load Points
                if(window.loadUserDashboard) window.loadUserDashboard();
            }

        } else {
            // Backend returned an error (wrong pass, wrong role, etc)
            showPopup("Login Failed", data.message, "error");
        }

    } catch (error) {
        console.error("Login Error:", error);
        showPopup("Connection Error", "Could not connect to server.", "error");
    } finally {
        // Reset Button
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function updateNav() {
    if (currentUser) {
        // ... (existing buttons code) ...

        // ✅ FIX: Display the Org/Municipality Name
        const orgDisplay = document.getElementById('org-name-display');
        if (orgDisplay) {
            if (currentUser.role === 'official') {
                orgDisplay.innerText = `🏛️ ${currentUser.zone_name || 'My Office'}`;
            } else {
                orgDisplay.innerText = `👤 ${currentUser.name}`;
            }
        }
    }
}

// B. HANDLE SIGNUP
window.handleSignup = async function() {
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPass').value;
    const name = document.getElementById('signupName').value;
    
    // Get Territory Inputs
    const zoneType = document.getElementById('signupZoneType').value;
    const zoneName = document.getElementById('signupZoneName').value;

    try {
        // Validate inputs
        if (!name || !email || !pass || !zoneName) {
            throw new Error("Please fill in all fields.");
        }

        // 1. Create Authentication in Firebase (This creates the secure user)
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = userCredential.user.uid;

        // 2. Prepare Data for Database
        const commonData = {
            name: name,
            email: email,
            password: pass,  // 🟢 FIX: THIS LINE WAS MISSING!
            zone_type: zoneType,
            zone_name: zoneName,
            createdAt: serverTimestamp()
        };

        if (currentLoginType === 'official') {
            
            // SAVE OFFICIAL DATA
            await setDoc(doc(db, "users", uid), {
                ...commonData,
                role: 'official',
                organization: zoneName 
            });

            // Update Global Variable
            currentUser = { 
                uid: uid,
                email: email, 
                role: 'official', 
                zone_name: zoneName,
                name: name 
            };
            localStorage.setItem('user', JSON.stringify(currentUser)); // Save session
            
            // Switch UI to Official
            document.getElementById('nav-citizen').style.display = 'none';
            document.getElementById('nav-official').style.display = 'flex';
            document.getElementById('org-name-display').innerText = `🏛️ ${zoneName}`;
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
            if(modal) modal.hide();

            showSection('admin-section');
            loadDashboard();
            showPopup("Account Created", `Welcome Official of ${zoneName}!`, "success");

        } else {
            // SAVE CITIZEN DATA
            await setDoc(doc(db, "users", uid), {
                ...commonData,
                role: 'citizen',
                civicPoints: 0
            });

            // Update Global Variable
            currentUser = { 
                uid: uid,
                email: email, 
                role: 'citizen', 
                zone_name: zoneName,
                name: name
            };
            localStorage.setItem('user', JSON.stringify(currentUser)); // Save session

            // Switch UI to Citizen
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'block';

            // Safe Point Loading
            try {
                const pointsEl = document.getElementById("civic-points");
                if (pointsEl) pointsEl.innerText = "0";
            } catch(e) { console.log(e); }

            const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
            if(modal) modal.hide();

            showPopup("Account Created!", "Welcome to CivicFix.", "success");
            showSection('report-section');
        }

    } catch (error) {
        console.error(error);
        showPopup("Signup Failed", error.message, "error");
    }
}

// C. HANDLE LOGOUT
window.handleLogout = async function() {
    await signOut(auth);
    currentUser = null;
    showPopup("Logged Out", "See you next time!", "info");
    setTimeout(() => window.location.reload(), 1500);
}

// D. HANDLE FORGOT PASSWORD
window.handleReset = async function(email) {
    if(!email) return;
    try {
        await sendPasswordResetEmail(auth, email);
        showPopup("Email Sent", "Check your inbox for the reset link.", "success");
    } catch (error) {
        showPopup("Error", error.message, "error");
    }
}

// ============================================
// 4. USER DASHBOARD (MY REPORTS)
// ============================================
window.loadUserDashboard = async function() {
    if(!currentUser) return;
    const container = document.getElementById('user-reports-container');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-success"></div></div>';
    
    // 🟢 FIX: ALWAYS FETCH LATEST POINTS WHEN DASHBOARD LOADS
    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const pointsEl = document.getElementById("civic-points");
        if (pointsEl && userDoc.exists()) {
            pointsEl.innerText = userDoc.data().civicPoints || 0;
        }
    } catch(e) {
        console.log("Error syncing points:", e);
    }

    // LOAD REPORTS
    try {
        const q = query(collection(db, "reports"), where("userEmail", "==", currentUser.email));
        const querySnapshot = await getDocs(q);
        let html = "";
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : "Just now";
            let statusColor = data.status === "Resolved" ? "bg-success" : (data.status === "In Progress" ? "bg-primary" : "bg-warning");
            
            let bgImage = data.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image+Available';

            let replyHtml = `<div class="p-3 bg-light rounded text-muted small text-center mt-3">Waiting for official response...</div>`;
            if(data.adminComment && data.adminComment.trim() !== "") {
                replyHtml = `
                <div class="p-3 bg-info bg-opacity-10 border border-info rounded mt-3">
                    <strong class="text-info-emphasis">🏛️ Official Reply:</strong>
                    <p class="mb-0 mt-1 text-dark">${data.adminComment}</p>
                </div>`;
            }

            html += `
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-0 rounded-4">
                    <div style="height: 220px; background-image: url('${bgImage}'); background-size: cover; background-position: center; border-radius: 16px 16px 0 0; position: relative;">
                        <span class="badge ${statusColor} position-absolute top-0 end-0 m-3 px-3 py-2 shadow-sm" style="font-size:0.9rem;">${data.status || "Pending"}</span>
                    </div>
                    
                    <div class="card-body">
                        <small class="text-muted d-block mb-2">📅 ${date}</small>
                        <h5 class="card-title text-capitalize fw-bold">${(data.issue || "Issue Reported").substring(0, 40)}...</h5>
                        <p class="text-muted small">${data.issue}</p>
                        ${replyHtml}
                    </div>
                </div>
            </div>`;
        });
        
        container.innerHTML = html || '<div class="text-center text-muted mt-5"><h5>No reports found.</h5><p>Go to "Report Waste" to submit your first issue!</p></div>';
        
    } catch (e) { 
        console.error(e);
        container.innerHTML = '<p class="text-danger text-center">Error loading history.</p>';
    }
}

// ============================================
// 5. 🏛️ ADMIN DASHBOARD LOGIC
// ============================================

window.loadDashboard = async function() {
    const container = document.getElementById('reports-container');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Scanning territory reports...</p></div>';
    
    // Safety check for Official
    if (!currentUser || currentUser.role !== 'official' || !currentUser.zone_name) {
        container.innerHTML = '<div class="text-center text-danger py-5">Access Denied: Territory Info Missing.</div>';
        return;
    }

    // Prepare Official's Zone Name (lowercase for matching)
    const myZone = currentUser.zone_name.toLowerCase().trim();

    try {
        // 🟢 1. FETCH ALL REPORTS (We filter them in the loop below)
        const querySnapshot = await getDocs(collection(db, "reports"));
        
        let html = "";
        let count = 0;
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // 🟢 2. SMART FILTER: Check if names match loosely
            // Example: "Serampore" matches "Serampore Municipality"
            const reportZone = (data.zone_name || "").toLowerCase().trim();
            
            if (reportZone && (myZone.includes(reportZone) || reportZone.includes(myZone))) {
                
                count++;
                const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : "Just now";
                
                // Color Logic for Badges
                let statusColor = "bg-warning";
                if (data.status === "In Progress") statusColor = "bg-primary";
                if (data.status === "Resolved") statusColor = "bg-success";

                // Dashboard Map Link Fix
                let mapUrl = data.googleMapsLink;
                if ((!mapUrl || !mapUrl.startsWith("http")) && data.location) {
                    mapUrl = `https://www.google.com/maps?q=${data.location.lat},${data.location.lng}`;
                }

                // Image Handling
                let bgImage = data.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image+Available';
                let viewBtn = `<button onclick="openImage('${data.imageUrl}')" class="btn btn-sm btn-outline-secondary w-50 rounded-pill">View Photo</button>`;

                html += `
                <div class="col-md-6 mb-4">
                    <div class="card h-100 shadow-sm border-0 rounded-4">
                        <div style="height: 220px; background-image: url('${bgImage}'); background-size: cover; background-position: center; border-radius: 16px 16px 0 0; position: relative;">
                            <span class="badge ${statusColor} position-absolute top-0 end-0 m-3 px-3 py-2 shadow-sm" id="badge-${doc.id}">${data.status || "Pending"}</span>
                        </div>
                        
                        <div class="card-body">
                            <div class="d-flex justify-content-between">
                                <small class="text-muted mb-2">📅 ${date}</small>
                                <small class="text-primary fw-bold">📍 ${data.zone_name}</small>
                            </div>
                            
                            <h5 class="card-title text-capitalize">${(data.issue || "Issue").substring(0, 40)}...</h5>
                            <p class="card-text small text-muted">
                                <strong>AI Analysis:</strong> ${data.issue}<br>
                                <strong>Edge AI:</strong> ${data.tf_detection || "None"}
                            </p>
                            
                            <div class="d-flex gap-2 mb-3">
                                <a href="${mapUrl}" target="_blank" class="btn btn-sm btn-outline-primary w-50 rounded-pill">View Map</a>
                                ${viewBtn}
                            </div>

                            <div class="bg-light p-3 rounded-4">
                                <label class="small fw-bold text-muted mb-1">Update Status:</label>
                                <select class="form-select form-select-sm mb-2 rounded-pill" onchange="updateStatus('${doc.id}', this.value)">
                                    <option value="Pending" ${data.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                                    <option value="In Progress" ${data.status === 'In Progress' ? 'selected' : ''}>🛠️ In Progress</option>
                                    <option value="Resolved" ${data.status === 'Resolved' ? 'selected' : ''}>✅ Resolved</option>
                                </select>

                                <label class="small fw-bold text-muted mb-1">Official Reply:</label>
                                <div class="input-group input-group-sm">
                                    <input type="text" class="form-control rounded-start-pill" placeholder="Action taken..." id="comment-${doc.id}" value="${data.adminComment || ''}">
                                    <button class="btn btn-secondary rounded-end-pill" onclick="saveComment('${doc.id}')">Save</button>
                                </div>
                                
                                <button class="btn btn-outline-danger btn-sm mt-2 w-100 rounded-pill" onclick="deleteReport('${doc.id}')">🗑️ Delete Report</button>
                            </div>

                        </div>
                    </div>
                </div>`;
            } // End if match
        });
        
        container.innerHTML = html || `<div class="text-center text-muted py-5"><h3>No reports found for "${currentUser.zone_name}"</h3></div>`;
        
        // Update Counter
        const totalCounter = document.getElementById('total-reports');
        if(totalCounter) totalCounter.innerText = count;
        
    } catch (e) { 
        console.error(e);
        container.innerHTML = '<p class="text-danger text-center">Error loading data.</p>';
    }
}

// Update Status
window.updateStatus = async function(docId, newStatus) {
    try {
        await updateDoc(doc(db, "reports", docId), { status: newStatus });
        const badge = document.getElementById(`badge-${docId}`);
        badge.innerText = newStatus;
        badge.className = `badge ${newStatus === 'Resolved' ? 'bg-success' : (newStatus === 'In Progress' ? 'bg-primary' : 'bg-warning')} position-absolute top-0 end-0 m-3 px-3 py-2 shadow-sm`;
        showPopup("Updated", "Status changed successfully.", "success");
    } catch(e) { showPopup("Error", e.message, "error"); }
}

// Save Comment
window.saveComment = async function(docId) {
    const comment = document.getElementById(`comment-${docId}`).value;
    try {
        await updateDoc(doc(db, "reports", docId), { adminComment: comment });
        showPopup("Success", "Official comment saved!", "success");
    } catch(e) { showPopup("Error", e.message, "error"); }
}

// 🟢 BEAUTIFUL DELETE CONFIRMATION POPUP
window.deleteReport = function(docId) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to recover this report!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545', // Red color for delete
        cancelButtonColor: '#6c757d', // Grey color for cancel
        confirmButtonText: 'Yes, delete it!',
        borderRadius: '20px'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                // Delete from Firebase
                await deleteDoc(doc(db, "reports", docId));
                
                // Refresh the Dashboard immediately
                loadDashboard(); 
                
                // Show Success Popup
                Swal.fire(
                    'Deleted!',
                    'The report has been removed.',
                    'success'
                )
            } catch (e) {
                showPopup("Error", e.message, "error");
            }
        }
    });
}