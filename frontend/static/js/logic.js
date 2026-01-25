import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc, query, where, increment, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ============================================
// 📱 SMART DEVICE DETECTION
// ============================================
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;
console.log("Device Detected:", isMobile ? "Mobile (Lite Mode)" : "Desktop (Pro Mode)");

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
    const modelel = document.getElementById('loginModal');
    const model = bootstrap.Modal.getInstance(modelel);
    if (model) model.hide();

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

// 🟢 SMART COMPRESSION
const compressImage = async (file) => {
    const targetWidth = isMobile ? 400 : 800; 
    
    if (window.createImageBitmap) {
        try {
            const bitmap = await createImageBitmap(file, { 
                resizeWidth: targetWidth, 
                resizeQuality: 'medium' 
            });
            
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            
            bitmap.close(); 
            return canvas.toDataURL('image/jpeg', 0.6);
        } catch (e) {
            console.log("Bitmap method failed, using fallback.");
        }
    }

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scaleSize = targetWidth / img.width;
            
            if (img.width > targetWidth) {
                canvas.width = targetWidth;
                canvas.height = img.height * scaleSize;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.6)); 
        };
        img.onerror = (error) => reject(error);
    });
};

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
    // const orgGroup = document.getElementById('signupOrgGroup');
    const title = document.getElementById('signupTitle');
    const btn = document.getElementById('signupSubmitBtn');
    const z = document.getElementById('zonename');
    const z_type = document.getElementById('signupZoneType');
    const z_name = document.getElementById('signupZoneName');
    if (currentLoginType === 'official') {
        z.style.display ='block';
        z_type.disabled = false;
        z_name.disabled = false;
        // orgGroup.style.display = 'block';
        title.innerText = "Official Registration 🏛️";
        btn.innerText = "Create Official Account";
        btn.className = "btn btn-dark-official w-100 rounded-pill py-3 fw-bold";
    } else {
        z.style.display ='none';
        z_type.disabled = true;
        z_name.disabled = true;
        // orgGroup.style.display = 'none';
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
        const q = query(
            collection(db, "users"),
            where("role", "==", "citizen"),
            orderBy("civicPoints", "desc"),
            limit(50) 
        );

        const querySnapshot = await getDocs(q);
        let rowsHtml = '';
        let rank = 1;
        let count = 0;

        if (querySnapshot.empty) {
            rowsHtml = `<tr><td colspan="4" class="text-center p-4 text-muted">No contributors found yet.</td></tr>`;
        } else {
            const myZone = currentUser.role === 'official' ? (currentUser.zone_name || "").toLowerCase().trim() : null;

            querySnapshot.forEach((doc) => {
                const user = doc.data();
                const userZone = (user.zone_name || "").toLowerCase().trim();
                const points = user.civicPoints || 0;

                let showUser = true;
                if (currentUser.role === 'official') {
                    if (!userZone.includes(myZone) && !myZone.includes(userZone)) {
                        showUser = false; 
                    }
                }

                if (showUser && count < 10) {
                    count++;
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
                            <td class="p-3"><span class="badge bg-warning text-dark rounded-pill px-3">🏆 ${points}</span></td>
                            <td class="p-3 text-muted small">${user.email || "No Email"}</td>
                        </tr>`;
                }
            });
        }

        if (rowsHtml === '') {
            rowsHtml = `<tr><td colspan="4" class="text-center p-4 text-muted">No contributors found in your zone yet.</td></tr>`;
        }

        tableBody.innerHTML = rowsHtml;

    } catch (error) {
        console.error("Error loading leaderboard:", error);
        if (error.message.includes("index")) {
             tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center p-4">
                        <span class="text-danger fw-bold">⚠️ Database Index Missing</span><br>
                        <small>Open your Desktop Browser Console (F12) and click the <a href="#" onclick="alert('Open Console (F12) to click the blue link!')">Long Blue Link</a> to create it.</small>
                        <br><br>
                        <small class="text-muted">${error.message}</small>
                    </td>
                </tr>`;
        } else {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger p-3">Error: ${error.message}</td></tr>`;
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

// ============================================
// 🤖 TENSORFLOW (SMART LOADING)
// ============================================
let tfModel = null;
if (!isMobile && typeof cocoSsd !== 'undefined') {
    console.log("🖥️ Desktop detected: Loading TensorFlow...");
    cocoSsd.load().then(loadedModel => {
        tfModel = loadedModel;
        console.log("⚡ TensorFlow Edge Model Loaded!");
    }).catch(err => console.log("TensorFlow failed:", err));
} else {
    console.log("📱 Mobile detected: Skipped TensorFlow to save memory.");
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

// 🟢 NEW: HELPER FOR EXIF DATA
function convertDMSToDD(coords, ref) {
    let dd = coords[0] + coords[1]/60 + coords[2]/3600;
    if (ref == "S" || ref == "W") dd = dd * -1;
    return dd;
}

// 🟢 REPORT ACTION (UPDATED WITH EXIF & ZONE DETECTION)
if(reportBtn) {
    reportBtn.addEventListener('click', async () => {
        if (!fileToAnalyze) return;

        // UI Updates
        loading.style.display = 'block';
        reportBtn.disabled = true;
        reportBtn.innerText = "Locating..."; 

        const API_KEY = (window.CONFIG && window.CONFIG.GEMINI_API_KEY) ? window.CONFIG.GEMINI_API_KEY : "KEY_NOT_FOUND";
        if (API_KEY === "KEY_NOT_FOUND") console.error("API Key not found.");

        // 🧠 Core Processing Function (Called after we get Location)
        const processReport = async (lat, lng, locationSource) => {
            reportBtn.innerText = "Analyzing...";
            
            try {
                // 1. REVERSE GEOCODING (FIND ZONE)
                // 1. REVERSE GEOCODING (BigDataCloud - Mobile Friendly)
                let detectedZone = "Unknown Zone";
                try {
                    // 🟢 CHANGED: Using BigDataCloud instead of OpenStreetMap (Nominatim blocks mobile)
                    const geoUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
                    
                    const geoResponse = await fetch(geoUrl);
                    const geoData = await geoResponse.json();
                    
                    console.log("📍 Geo Data:", geoData); // Debugging

                    // BigDataCloud gives slightly different fields, so we check them in order:
                    detectedZone = geoData.locality || 
                                   geoData.city || 
                                   geoData.principalSubdivision || 
                                   geoData.countryName || 
                                   "Unknown Zone";
                                   
                    detectedZone = detectedZone.trim();
                    console.log("📍 Detected Zone:", detectedZone);

                } catch (e) { 
                    console.log("Zone detection failed", e); 
                    // Fallback to coordinates if API fails
                    detectedZone = `Zone (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
                }

                // 2. VACATION CHECK (Home vs Detected)
                if (currentUser && currentUser.zone_name) {
                    const userHomeZone = currentUser.zone_name.trim();
                    if (userHomeZone.toLowerCase() !== detectedZone.toLowerCase() && detectedZone !== "Unknown Zone") {
                         showPopup(
                            "📍 Outside Home Zone", 
                            `You are currently in ${detectedZone}. This report will be sent to ${detectedZone} officials, not ${userHomeZone}.`, 
                            "info"
                        );
                    }
                }

                // 3. COMPRESS & AI ANALYSIS
                const compressedImage = await compressImage(fileToAnalyze);
                
                let tfResultText = "Skipped (Mobile Optimization)";
                if (tfModel) {
                    try {
                        const imgForTf = document.getElementById('preview');
                        const predictions = await tfModel.detect(imgForTf);
                        if (predictions.length > 0) {
                            tfResultText = `Found: ${predictions.map(p => p.class).join(", ")}`;
                        } else {
                            tfResultText = "No specific objects found.";
                        }
                    } catch(e) { console.log("TF Skipped", e); }
                }

                let geminiText = "Analysis Failed";
                try {
                    const genAI = new GoogleGenerativeAI(API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
                    const base64Data = compressedImage.split(',')[1];
                    const prompt = "Identify the civic issue in this image (e.g., garbage, pothole) in 1 short sentence.";
                    const imagePart = { inlineData: { data: base64Data, mimeType: "image/jpeg" } };
                    const result = await model.generateContent([prompt, imagePart]);
                    geminiText = (await result.response).text();
                } catch (apiError) {
                    geminiText = "Error: " + (apiError.message || "Unknown API Error");
                }

                // 4. SAVE TO FIREBASE (With Detected Zone)
                const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
                await addDoc(collection(db, "reports"), {
                    issue: geminiText,
                    imageUrl: compressedImage,
                    tf_detection: tfResultText,
                    severity: "High",
                    status: "Pending",
                    adminComment: "",
                    location: { lat: lat, lng: lng },
                    locationSource: locationSource, // Track if it was GPS or EXIF
                    zone_name: detectedZone, // 🟢 USE DETECTED ZONE
                    googleMapsLink: mapUrl,
                    timestamp: serverTimestamp(),
                    userEmail: currentUser ? currentUser.email : "Anonymous"
                });

                if (currentUser && currentUser.uid) {
                    await addCivicPoints(currentUser, 10);
                }

                // UI Finalize
                aiText.innerHTML = `
                    <div class="alert alert-secondary py-1 mb-2" style="font-size:0.9em">⚡ <strong>Edge AI:</strong> ${tfResultText}</div>
                    <strong>Analysis:</strong> ${geminiText}<br>
                    <small class="text-muted">📍 Location Source: ${locationSource}</small><br><br>
                    <p>This report is sent to ${detectedZone} Corporation</p>
                    <a href="${mapUrl}" target="_blank" style="color:var(--primary-color);">View Map</a>
                    <p style="color:rgb(20,231,20); font-weight: bolder;">REPORT SENT! +10 POINTS</P>
                    
                `;
                
                loading.style.display = 'none';
                resultDiv.style.display = 'block';
                // 🟢 UPDATED POPUP: Shows exactly where it went
                showPopup(
                    "Report Filed! ✅", 
                    `Your report has been sent to the ${detectedZone} Corporation/Official. (+10 Points)`, 
                    "success"
                );
                reportBtn.innerText = "Report Issue";
                reportBtn.disabled = false;

            } catch (error) {
                console.error("Error:", error);
                loading.style.display = 'none';
                showPopup("Error", "Debug: " + error.message, "error");
                reportBtn.innerText = "Report Issue";
                reportBtn.disabled = false;
            }
        };

        // 🟢 LOCATING LOGIC: EXIF -> GPS -> ERROR
        if (typeof EXIF !== 'undefined') {
            EXIF.getData(fileToAnalyze, function() {
                const lat = EXIF.getTag(this, "GPSLatitude");
                const lng = EXIF.getTag(this, "GPSLongitude");

                if (lat && lng) {
                    const finalLat = convertDMSToDD(lat, EXIF.getTag(this, "GPSLatitudeRef"));
                    const finalLng = convertDMSToDD(lng, EXIF.getTag(this, "GPSLongitudeRef"));
                    console.log("📍 Found location inside image (EXIF)");
                    processReport(finalLat, finalLng, "Image Data (EXIF)");
                } else {
                    console.log("No EXIF, falling back to Device GPS");
                    getDeviceLocation();
                }
            });
        } else {
            // If library missing, fallback
            getDeviceLocation();
        }

        function getDeviceLocation() {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => processReport(pos.coords.latitude, pos.coords.longitude, "Device GPS"),
                    (err) => {
                         loading.style.display = 'none';
                         reportBtn.disabled = false;
                         reportBtn.innerText = "Report Issue";
                         showPopup("Location Error", "Could not find location from Image or Device. Please enable GPS.", "error");
                    },
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            } else {
                showPopup("Error", "Geolocation not supported.", "error");
                loading.style.display = 'none';
                reportBtn.disabled = false;
            }
        }
    });
}

// ... (Rest of Auth/Dashboard handlers) ...

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    const role = document.getElementById('tab-official') && document.getElementById('tab-official').classList.contains('active') ? 'official' : 'citizen';
    const btn = document.getElementById('loginSubmitBtn');
    const originalText = btn.innerText;
    
    btn.innerText = "Verifying...";
    btn.disabled = true;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        
        // 🟢 SECURITY: CHECK VERIFICATION
        if (!user.emailVerified) {
            await signOut(auth);
            throw new Error("Please verify your email address before logging in. Check your inbox.");
        }

        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.role !== role) throw new Error(`Please login as ${data.role}`);

            currentUser = { uid: user.uid, name: data.name, email: email, role: data.role, zone_name: data.zone_name, zone_type: data.zone_type };
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
        } else { throw new Error("User record not found."); }
    } catch (error) { showPopup("Login Failed", error.message, "error"); } finally { btn.innerText = originalText; btn.disabled = false; }
}

window.handleSignup = async function() {
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPass').value;
    const name = document.getElementById('signupName').value;
    

    // 🟢 SECURITY: STRONG PASSWORD CHECK
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!strongPasswordRegex.test(pass)) {
        showPopup("Weak Password", "Password must be 8+ chars, with Uppercase, Number & Symbol.", "error");
        return;
    }

    try {
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = userCredential.user.uid;
        // 🟢 SECURITY: SEND VERIFICATION EMAIL
        await sendEmailVerification(userCredential.user);  

        const commonData = { name: name, email: email, createdAt: serverTimestamp() };

        if (currentLoginType === 'official') {
            const zoneType = document.getElementById('signupZoneType').value;
            const zoneName = document.getElementById('signupZoneName').value;

            if (!name || !email || !pass || !zoneName) throw new Error("Please fill in all fields.");

            await setDoc(doc(db, "users", uid), { ...commonData, zone_type: zoneType, zone_name: zoneName, role: 'official', organization: zoneName });
        } else {

            if (!name || !email || !pass ) throw new Error("Please fill in all fields.");
                      


            await setDoc(doc(db, "users", uid), { ...commonData, role: 'citizen', civicPoints: 0 });
        }
        
        // 🟢 LOGOUT IMMEDIATELY FOR VERIFICATION
        await signOut(auth);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
        if(modal) modal.hide();
        showPopup("Registration Successful", `Verification link sent to ${email}. Please verify before logging in.`, "success");
        
    } catch (error) { showPopup("Signup Failed", error.message, "error"); }
}

// 🟢 NEW: AUTO DETECT ZONE FOR SIGNUP
window.detectSignupLocation = function() {
    const btn = document.querySelector('button[onclick="detectSignupLocation()"]');
    if(btn) btn.innerText = "Locating...";
    
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                // const { latitude, longitude, accuracy } = pos.coords;

                const latitude = pos.coords.latitude;
                const longitude = pos.coords.longitude;


                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;
                const response = await fetch(url);
                const data = await response.json();
                
                const zone = data.address.city || data.address.town || data.address.village || data.address.state_district || data.address.county || "Unknown";
                console.log(data.address.state_district);
                console.log(latitude);
                console.log(longitude);
                // console.log("accuracy ",accuracy, "meter");
                document.getElementById('signupZoneName').value = zone;
                if(btn) {
                    btn.innerText = "✅ Found";
                    btn.className = "btn btn-success";
                }
            } catch(e) {
                if(btn) btn.innerText = "❌ Failed";
                alert("Could not detect. Please type manually.");
            }
        }, console.error, {enableHighAccuracy: true});
    } else {
        alert("Geolocation not supported.");
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
    } catch (error) { 
        showPopup("Error", error.message, "error"); 
    }
}

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
                        <small class="text-muted d-block mb-2">📅 ${date} • 📍 ${data.zone_name || "Unknown"}</small>
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

window.updateStatus = async function(docId, newStatus) {
    try {
        await updateDoc(doc(db, "reports", docId), { status: newStatus });
        const badge = document.getElementById(`badge-${docId}`);
        badge.innerText = newStatus;
        badge.className = `badge ${newStatus === 'Resolved' ? 'bg-success' : (newStatus === 'In Progress' ? 'bg-primary' : 'bg-warning')} position-absolute top-0 end-0 m-3 px-3 py-2 shadow-sm`;
        showPopup("Updated", "Status changed successfully.", "success");
    } catch(e) { showPopup("Error", e.message, "error"); }
}

window.saveComment = async function(docId) {
    const comment = document.getElementById(`comment-${docId}`).value;
    try {
        await updateDoc(doc(db, "reports", docId), { adminComment: comment });
        showPopup("Success", "Official comment saved!", "success");
    } catch(e) { showPopup("Error", e.message, "error"); }
}

window.deleteReport = function(docId) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to recover this report!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545', 
        cancelButtonColor: '#6c757d', 
        confirmButtonText: 'Yes, delete it!',
        borderRadius: '20px'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "reports", docId));
                loadDashboard(); 
                Swal.fire('Deleted!', 'The report has been removed.', 'success')
            } catch (e) { showPopup("Error", e.message, "error"); }
        }
    });
}