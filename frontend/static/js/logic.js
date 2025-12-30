import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc, query, where, increment, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ============================================
// 🛑 YOUR FIREBASE KEYS
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
// 🟢 SESSION RESTORER
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            currentUser.role = userData.role;
            currentUser.org = userData.org || "";
            currentUser.zone_name = userData.zone_name || ""; 
            
            if (userData.role === 'official') {
                currentLoginType = 'official';
                document.getElementById('nav-citizen').style.display = 'none';
                document.getElementById('nav-official').style.display = 'flex';
                const orgDisplay = document.getElementById('org-name-display');
                if(orgDisplay) orgDisplay.innerText = `🏛️ ${userData.org || userData.zone_name}`;
            } else {
                currentLoginType = 'citizen';
                document.getElementById('loginBtn').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'block';
                
                const pointsEl = document.getElementById("civic-points");
                if (pointsEl) pointsEl.innerText = userData.civicPoints || 0;
            }
        }
        console.log("Session restored for:", user.email);
    } else {
        currentUser = null;
    }
});

// ============================================
// 1. UI HELPERS
// ============================================

const showPopup = (title, text, icon) => {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: title,
            text: text,
            icon: icon,
            confirmButtonColor: '#198754',
            borderRadius: '20px'
        });
    } else {
        alert(`${title}: ${text}`);
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

window.openImage = function(imgData) {
    if(!imgData || imgData === '#' || imgData.length < 100) {
        showPopup("No Image", "This report has no valid image.", "info");
        return;
    }
    const w = window.open("");
    w.document.write(`<img src="${imgData}" style="width:100%; max-width:800px;">`);
}

const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; 
            const scaleSize = MAX_WIDTH / img.width;
            
            if (img.width > MAX_WIDTH) {
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.6)); 
        }
        img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
});

window.setLoginType = function(type) {
    currentLoginType = type;
    const btn = document.getElementById('loginSubmitBtn');
    const orgInput = document.getElementById('orgInputGroup');
    const createLink = document.getElementById('createAccountLink');
    const tabCitizen = document.getElementById('tab-citizen');
    const tabOfficial = document.getElementById('tab-official');

    if (type === 'official') {
        btn.innerText = "Login to Dashboard";
        btn.className = "btn btn-dark-official w-100 rounded-pill py-3 fw-bold shadow-sm"; 
        orgInput.style.display = 'block'; 
        createLink.style.display = 'block'; 
        tabCitizen.classList.remove('active');
        tabOfficial.classList.add('active');
    } else {
        btn.innerText = "Login as Citizen";
        btn.className = "btn btn-enchanting w-100 rounded-pill py-3 fw-bold shadow-sm"; 
        orgInput.style.display = 'none';
        createLink.style.display = 'block'; 
        tabCitizen.classList.add('active');
        tabOfficial.classList.remove('active');
    }
}

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

    tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Loading top contributors...</td></tr>';

    try {
        let q;
        if (currentUser && currentUser.role === 'official' && currentUser.zone_name) {
            q = query(
                collection(db, "users"),
                where("role", "==", "citizen"),
                where("zone_name", "==", currentUser.zone_name),
                orderBy("civicPoints", "desc"),
                limit(10)
            );
        } else {
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
            rowsHtml = `<tr><td colspan="4" class="text-center p-4 text-muted">No contributors found yet.</td></tr>`;
        } else {
            let rank = 1;
            querySnapshot.forEach((doc) => {
                const user = doc.data();
                rowsHtml += `
                    <tr>
                        <td class="p-3 fw-bold">#${rank++}</td>
                        <td class="p-3">
                            <div class="d-flex align-items-center">
                                <div class="bg-light rounded-circle d-flex align-items-center me-2" style="width: 35px; height: 35px; justify-content:center;">
                                    <i class="bi bi-person-fill text-secondary"></i>
                                </div>
                                ${user.name}
                            </div>
                        </td>
                        <td class="p-3"><span class="badge bg-warning text-dark rounded-pill px-3">🏆 ${user.civicPoints || 0}</span></td>
                        <td class="p-3 text-muted small"><i class="bi bi-envelope-at me-1"></i> ${user.email}</td>
                    </tr>`;
            });
        }
        tableBody.innerHTML = rowsHtml;

    } catch (error) {
        console.error("Error loading leaderboard:", error);
        if (error.message.includes("index")) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger p-3">⚠️ Missing Database Index. Open console for link.</td></tr>`;
        } else {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger p-3">Error loading data.</td></tr>`;
        }
    }
}

let map;

window.initMap = async function() {
    if (map) {
        setTimeout(() => map.invalidateSize(), 100);
        return;
    }

    if (!currentUser) {
        showPopup("Login Required", "Please login to view the map.", "warning");
        return; 
    }

    map = L.map('civicMap').setView([22.75, 88.34], 13); 

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    try {
        const q = query(collection(db, "reports"), where("zone_name", "==", currentUser.zone_name));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showPopup("No Data", "No reports found for the map.", "info");
        }

        querySnapshot.forEach((doc) => {
            const report = doc.data();
            if (report.location && report.location.lat && report.location.lng) {
                const markerColor = report.status === 'Solved' ? 'green' : 'red';
                const marker = L.marker([report.location.lat, report.location.lng]).addTo(map);
                marker.bindPopup(`
                    <b>Issue:</b> ${report.issue}<br>
                    <b>Status:</b> <span style="color:${markerColor}">${report.status}</span><br>
                    <small>${new Date(report.timestamp.seconds * 1000).toLocaleDateString()}</small><br>
                    <img src="${report.imageUrl}" style="width:100px; margin-top:5px; border-radius:5px;">
                `);
            }
        });
    } catch (error) {
        console.error("Error loading map data:", error);
    }
}

window.checkAuthAndShow = function(sectionId) {
    if (!currentUser) {
        showPopup("Access Restricted", "Please Login to report issues.", "warning");
        const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
        loginModal.show();
    } else {
        showSection(sectionId);
        if(sectionId === 'user-dashboard-section') loadUserDashboard();
        if(sectionId === 'leaderboard-section') loadLeaderboard();
    }
}

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

let tfModel = null;
if (typeof cocoSsd !== 'undefined') {
    cocoSsd.load().then(loadedModel => {
        tfModel = loadedModel;
        console.log("⚡ TensorFlow Edge Model Loaded!");
    }).catch(err => console.log("TensorFlow failed:", err));
}

async function addCivicPoints(user, points = 10) {
    if (!user) return;
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const currentPoints = userSnap.data().civicPoints || 0;
            await updateDoc(userRef, { civicPoints: currentPoints + points });
        }
    } catch (e) { console.log("Error adding points:", e); }
}

// 🟢 REPORT ACTION (Smart GPS + Direct Gemini + CONFIG FIX)
if(reportBtn) {
    reportBtn.addEventListener('click', async () => {
        if (!fileToAnalyze) return;

        // UI Updates
        loading.style.display = 'block';
        reportBtn.disabled = true;
        reportBtn.innerText = "Locating..."; 

        // 🟢 LOAD KEY FROM CONFIG.JS
        // Ensure you have created static/js/config.js with your key!
        const API_KEY = CONFIG.GEMINI_API_KEY; 

        // 1. Success Callback (Shared for both GPS attempts)
        const onLocationFound = async (position) => {
            reportBtn.innerText = "Analyzing...";
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            try {
                // 1. COMPRESS IMAGE (For Database)
                const compressedImage = await compressImage(fileToAnalyze);

                // 2. EDGE AI (TensorFlow) - Optional
                let tfResultText = "No obstacles detected.";
                if (window.tfModel) {
                    try {
                        const imgForTf = document.getElementById('preview');
                        const predictions = await window.tfModel.detect(imgForTf);
                        if (predictions.length > 0) {
                            const objects = predictions.map(p => p.class).join(", ");
                            tfResultText = `Found: ${objects}`;
                        }
                    } catch(e) { console.log("TF Skipped", e); }
                }

                // 3. GEMINI AI (DIRECT CLIENT-SIDE CALL)
                let geminiText = "Analysis Failed";
                try {
                    const genAI = new GoogleGenerativeAI(API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

                    // Convert file to Base64 for Gemini
                    const base64Data = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(fileToAnalyze);
                    });

                    const prompt = "Identify the civic issue in this image (e.g., garbage, pothole, waterlogging) in 1 short sentence.";
                    const imagePart = {
                        inlineData: { data: base64Data, mimeType: fileToAnalyze.type },
                    };

                    const result = await model.generateContent([prompt, imagePart]);
                    const response = await result.response;
                    geminiText = response.text();
                } catch (apiError) {
                    console.error("Gemini API Error:", apiError);
                    geminiText = "AI Service Unavailable (Check API Key)";
                }

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

                // SHOW RESULT
                aiText.innerHTML = `
                    <div class="alert alert-secondary py-1 mb-2" style="font-size:0.9em">⚡ <strong>Edge AI:</strong> ${tfResultText}</div>
                    <strong>Analysis:</strong> ${geminiText}<br><br>
                    📍 <strong>Location:</strong> <a href="${mapUrl}" target="_blank" style="color:var(--primary-color);">View Map</a>
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
            alert("Could not get location. Check GPS/Permissions.");
            reportBtn.disabled = false;
            reportBtn.innerText = "Report Issue";
        };

        // 3. SMART EXECUTION
        if ("geolocation" in navigator) {
            // Attempt 1: High Accuracy (Wait 5s)
            navigator.geolocation.getCurrentPosition(
                onLocationFound, 
                (err) => {
                    console.log("High Accuracy failed. Retrying with Low Accuracy...");
                    // Attempt 2: Low Accuracy (Reliable fallback)
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

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    const role = document.getElementById('tab-official') && document.getElementById('tab-official').classList.contains('active') ? 'official' : 'citizen';
    const btn = document.getElementById('loginSubmitBtn');
    const originalText = btn.innerText;
    
    btn.innerText = "Verifying...";
    btn.disabled = true;

    try {
        // 🟢 FIX: USE FIREBASE AUTH DIRECTLY (No Python Backend)
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // Get User Data from Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            const data = userDoc.data();
            
            // Check Role
            if (data.role !== role) {
                throw new Error(`Please login as ${data.role}`);
            }

            currentUser = {
                uid: user.uid,
                name: data.name,
                email: email,
                role: data.role,
                zone_name: data.zone_name,
                zone_type: data.zone_type
            };
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
            if(modal) modal.hide();
            showPopup("Welcome!", `Logged in as ${data.role}`, "success");

            if (currentUser.role === 'official') {
                document.getElementById('nav-citizen').style.display = 'none';
                document.getElementById('nav-official').style.display = 'flex';
                document.getElementById('org-name-display').innerText = `🏛️ ${currentUser.zone_name}`;
                showSection('admin-section');
                loadDashboard();
            } else {
                document.getElementById('nav-citizen').style.display = 'flex';
                document.getElementById('nav-official').style.display = 'none';
                document.getElementById('loginBtn').style.display = 'none';
                document.getElementById('logoutBtn').style.display = 'block';
                showSection('home-section');
                loadUserDashboard();
            }
        } else {
            throw new Error("User record not found.");
        }
    } catch (error) {
        showPopup("Login Failed", error.message, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

window.handleSignup = async function() {
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPass').value;
    const name = document.getElementById('signupName').value;
    const zoneType = document.getElementById('signupZoneType').value;
    const zoneName = document.getElementById('signupZoneName').value;

    try {
        if (!name || !email || !pass || !zoneName) throw new Error("Please fill in all fields.");
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = userCredential.user.uid;
        
        const commonData = {
            name: name,
            email: email,
            password: pass, 
            zone_type: zoneType,
            zone_name: zoneName,
            createdAt: serverTimestamp()
        };

        if (currentLoginType === 'official') {
            await setDoc(doc(db, "users", uid), { ...commonData, role: 'official', organization: zoneName });
            currentUser = { uid, email, role: 'official', zone_name: zoneName, name };
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            document.getElementById('nav-citizen').style.display = 'none';
            document.getElementById('nav-official').style.display = 'flex';
            document.getElementById('org-name-display').innerText = `🏛️ ${zoneName}`;
            const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
            if(modal) modal.hide();
            showSection('admin-section');
            loadDashboard();
            showPopup("Account Created", `Welcome Official!`, "success");
        } else {
            await setDoc(doc(db, "users", uid), { ...commonData, role: 'citizen', civicPoints: 0 });
            currentUser = { uid, email, role: 'citizen', zone_name: zoneName, name };
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'block';
            const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
            if(modal) modal.hide();
            showPopup("Account Created!", "Welcome.", "success");
            showSection('report-section');
        }
    } catch (error) {
        showPopup("Signup Failed", error.message, "error");
    }
}

window.handleLogout = async function() {
    await signOut(auth);
    currentUser = null;
    localStorage.removeItem('user');
    showPopup("Logged Out", "See you next time!", "info");
    setTimeout(() => window.location.reload(), 1500);
}

window.handleReset = async function(email) {
    if(!email) return;
    try {
        await sendPasswordResetEmail(auth, email);
        showPopup("Email Sent", "Check your inbox.", "success");
    } catch (error) { showPopup("Error", error.message, "error"); }
}

// 4. USER DASHBOARD
window.loadUserDashboard = async function() {
    if(!currentUser) return;
    const container = document.getElementById('user-reports-container');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-success"></div></div>';
    
    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const pointsEl = document.getElementById("civic-points");
        if (pointsEl && userDoc.exists()) pointsEl.innerText = userDoc.data().civicPoints || 0;
    } catch(e) {}

    try {
        const q = query(collection(db, "reports"), where("userEmail", "==", currentUser.email));
        const querySnapshot = await getDocs(q);
        let html = "";
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : "Just now";
            let statusColor = data.status === "Resolved" ? "bg-success" : (data.status === "In Progress" ? "bg-primary" : "bg-warning");
            let bgImage = data.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image';
            
            let replyHtml = `<div class="p-3 bg-light rounded text-muted small text-center mt-3">Waiting for official response...</div>`;
            if(data.adminComment && data.adminComment.trim() !== "") {
                replyHtml = `<div class="p-3 bg-info bg-opacity-10 border border-info rounded mt-3"><strong>🏛️ Official Reply:</strong><p class="mb-0 mt-1 text-dark">${data.adminComment}</p></div>`;
            }

            html += `
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-0 rounded-4">
                    <div style="height: 220px; background-image: url('${bgImage}'); background-size: cover; background-position: center; border-radius: 16px 16px 0 0; position: relative;">
                        <span class="badge ${statusColor} position-absolute top-0 end-0 m-3 px-3 py-2 shadow-sm">${data.status || "Pending"}</span>
                    </div>
                    <div class="card-body">
                        <small class="text-muted d-block mb-2">📅 ${date}</small>
                        <h5 class="card-title text-capitalize fw-bold">${(data.issue || "Issue").substring(0, 40)}...</h5>
                        <p class="text-muted small">${data.issue}</p>
                        ${replyHtml}
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html || '<div class="text-center text-muted mt-5"><h5>No reports found.</h5></div>';
    } catch (e) { container.innerHTML = '<p class="text-danger text-center">Error loading history.</p>'; }
}

// 5. OFFICIAL DASHBOARD
window.loadDashboard = async function() {
    const container = document.getElementById('reports-container');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    
    if (!currentUser || currentUser.role !== 'official') {
        container.innerHTML = '<div class="text-center text-danger py-5">Access Denied.</div>';
        return;
    }

    const myZone = (currentUser.zone_name || "").toLowerCase().trim();

    try {
        const querySnapshot = await getDocs(collection(db, "reports"));
        let html = "";
        let count = 0;
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const reportZone = (data.zone_name || "").toLowerCase().trim();
            
            if (reportZone && (myZone.includes(reportZone) || reportZone.includes(myZone))) {
                count++;
                const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : "Just now";
                let statusColor = data.status === "In Progress" ? "bg-primary" : (data.status === "Resolved" ? "bg-success" : "bg-warning");
                let bgImage = data.imageUrl || 'https://via.placeholder.com/600x400';
                
                html += `
                <div class="col-md-6 mb-4">
                    <div class="card h-100 shadow-sm border-0 rounded-4">
                        <div style="height: 220px; background-image: url('${bgImage}'); background-size: cover; position: relative;">
                            <span class="badge ${statusColor} position-absolute top-0 end-0 m-3" id="badge-${doc.id}">${data.status}</span>
                        </div>
                        <div class="card-body">
                            <div class="d-flex justify-content-between"><small>📅 ${date}</small><small class="text-primary fw-bold">📍 ${data.zone_name}</small></div>
                            <h5 class="card-title text-capitalize">${(data.issue || "Issue").substring(0, 40)}...</h5>
                            <div class="d-flex gap-2 mb-3">
                                <a href="${data.googleMapsLink}" target="_blank" class="btn btn-sm btn-outline-primary w-50 rounded-pill">View Map</a>
                                <button onclick="openImage('${data.imageUrl}')" class="btn btn-sm btn-outline-secondary w-50 rounded-pill">Photo</button>
                            </div>
                            <div class="bg-light p-3 rounded-4">
                                <select class="form-select form-select-sm mb-2 rounded-pill" onchange="updateStatus('${doc.id}', this.value)">
                                    <option value="Pending" ${data.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                                    <option value="In Progress" ${data.status === 'In Progress' ? 'selected' : ''}>🛠️ In Progress</option>
                                    <option value="Resolved" ${data.status === 'Resolved' ? 'selected' : ''}>✅ Resolved</option>
                                </select>
                                <div class="input-group input-group-sm">
                                    <input type="text" class="form-control rounded-start-pill" placeholder="Reply..." id="comment-${doc.id}" value="${data.adminComment || ''}">
                                    <button class="btn btn-secondary rounded-end-pill" onclick="saveComment('${doc.id}')">Save</button>
                                </div>
                                <button class="btn btn-outline-danger btn-sm mt-2 w-100 rounded-pill" onclick="deleteReport('${doc.id}')">Delete</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            }
        });
        container.innerHTML = html || '<div class="text-center py-5"><h3>No reports found for this zone.</h3></div>';
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