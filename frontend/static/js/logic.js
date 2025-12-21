import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// ============================================
// 🛑 PASTE FIREBASE KEYS HERE
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

// UI Logic Variables
const cameraInput = document.getElementById('cameraInput');
const preview = document.getElementById('preview');
const reportBtn = document.getElementById('reportBtn');
const loading = document.getElementById('loading');
const resultDiv = document.getElementById('result');
const aiText = document.getElementById('aiText');
let fileToAnalyze = null;

// ============================================
// 1. NAVIGATION LOGIC
// ============================================
window.showSection = function(sectionId) {
    document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    const navbarToggler = document.querySelector('.navbar-toggler');
    const navbarCollapse = document.querySelector('.navbar-collapse');
    if(navbarCollapse.classList.contains('show')) {
        navbarToggler.click();
    }
}

// ============================================
// 2. CAMERA PREVIEW
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

// ============================================
// 3. LOAD TENSORFLOW MODEL (Edge AI)
// ============================================
let tfModel = null;
if (typeof cocoSsd !== 'undefined') {
    cocoSsd.load().then(loadedModel => {
        tfModel = loadedModel;
        console.log("⚡ TensorFlow Edge Model Loaded!");
    }).catch(err => {
        console.log("TensorFlow failed to load:", err);
    });
}

// ============================================
// 4. MAIN REPORT ACTION (With Python Backend)
// ============================================
if(reportBtn) {
    reportBtn.addEventListener('click', async () => {
        if (!fileToAnalyze) return;

        // UI Updates
        loading.style.display = 'block';
        reportBtn.disabled = true;
        document.querySelector('#loading p').innerText = "📍 Getting GPS Location...";

        // STEP 1: GET GPS LOCATION
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                try {
                    // STEP 2: RUN TENSORFLOW (Edge AI Check)
                    let tfResultText = "No obstacles detected.";
                    if (tfModel) {
                        document.querySelector('#loading p').innerText = "⚡ TensorFlow is scanning...";
                        const imgForTf = document.getElementById('preview');
                        const predictions = await tfModel.detect(imgForTf);
                        if (predictions.length > 0) {
                            const objects = predictions.map(p => p.class).join(", ");
                            tfResultText = `Found: ${objects}`;
                        }
                    }

                    // STEP 3: SEND TO PYTHON BACKEND
                    document.querySelector('#loading p').innerText = "🤖 Vertex AI is analyzing...";
                    
                    const formData = new FormData();
                    formData.append("image", fileToAnalyze);
                    
                    // Sending to Flask Server
                    const response = await fetch('/api/analyze', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const data = await response.json();
                    if(data.error) throw new Error(data.error);
                    
                    const geminiText = data.result;

                    // STEP 4: SAVE TO FIREBASE
                    await addDoc(collection(db, "reports"), {
                        issue: geminiText,
                        tf_detection: tfResultText,
                        severity: "High", 
                        location: { lat: lat, lng: lng },
                        googleMapsLink: `http://googleusercontent.com/maps.google.com/maps?q=${lat},${lng}`,
                        timestamp: serverTimestamp()
                    });
                    console.log("Saved to Database!");

                    // STEP 5: SHOW RESULT
                    aiText.innerHTML = `
                        <div class="alert alert-secondary py-1 mb-2" style="font-size:0.9em">⚡ <strong>Edge AI:</strong> ${tfResultText}</div>
                        <strong>Vertex AI Analysis:</strong> ${geminiText}<br><br>
                        📍 <strong>Location:</strong> <a href="http://googleusercontent.com/maps.google.com/maps?q=${lat},${lng}" target="_blank" style="color:var(--primary-color); font-weight:bold;">View on Google Maps</a>
                    `;
                    
                    loading.style.display = 'none';
                    resultDiv.style.display = 'block';

                } catch (error) {
                    console.error("Error:", error);
                    loading.style.display = 'none';
                    alert("Analysis Error: " + error.message);
                    reportBtn.disabled = false;
                }

            }, (error) => {
                alert("⚠️ Location Required!");
                loading.style.display = 'none';
                reportBtn.disabled = false;
            });
        } else {
            alert("Geolocation not supported.");
            loading.style.display = 'none';
            reportBtn.disabled = false;
        }
    });
}

// ============================================
// 5. 🔐 AUTHENTICATION LOGIC
// ============================================

// A. HANDLE LOGIN
window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;

    // Check for Admin (Hardcoded Backdoor for Demo)
    if (email === "admin@civicfix.com" && pass === "admin123") {
        const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
        if(loginModal) loginModal.hide();
        showSection('admin-section');
        loadDashboard();
        return;
    }

    // Regular Firebase Login
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        alert("✅ Welcome back: " + userCredential.user.email);
        const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
        if(loginModal) loginModal.hide();
    } catch (error) {
        alert("❌ Login Failed: " + error.message);
    }
}

// B. HANDLE SIGNUP
window.handleSignup = async function() {
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPass').value;

    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        alert("🎉 Account Created! You are logged in.");
        const signupModal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
        if(signupModal) signupModal.hide();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

// C. HANDLE FORGOT PASSWORD
window.handleReset = async function() {
    const email = document.getElementById('resetEmail').value;

    try {
        await sendPasswordResetEmail(auth, email);
        alert("📧 Reset link sent to your email!");
        const forgotModal = bootstrap.Modal.getInstance(document.getElementById('forgotModal'));
        if(forgotModal) forgotModal.hide();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

// ============================================
// 6. 🏛️ ADMIN DASHBOARD LOGIC
// ============================================

window.loadDashboard = async function() {
    const container = document.getElementById('reports-container');
    const countLabel = document.getElementById('total-reports');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    
    try {
        const querySnapshot = await getDocs(collection(db, "reports"));
        let html = "";
        let count = 0;
        
        querySnapshot.forEach((doc) => {
            count++;
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : "Just now";
            
            html += `
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-0">
                    <div class="card-body">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="badge bg-danger">Severity: ${data.severity || "High"}</span>
                            <small class="text-muted">${date}</small>
                        </div>
                        <h5 class="card-title text-capitalize">${(data.issue || "Issue").substring(0, 40)}...</h5>
                        <p class="card-text small text-muted">
                            <strong>Analysis:</strong> ${data.issue}<br>
                            <strong>Edge AI:</strong> ${data.tf_detection || "None"}
                        </p>
                        <div class="d-flex gap-2">
                            <a href="${data.googleMapsLink}" target="_blank" class="btn btn-sm btn-outline-primary w-50">Map</a>
                            <button onclick="resolveIssue('${doc.id}')" class="btn btn-sm btn-success w-50">Resolve</button>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        
        container.innerHTML = html || '<div class="text-center text-muted">No pending reports!</div>';
        countLabel.innerText = count;
        
    } catch (e) { 
        console.error(e);
        container.innerHTML = '<p class="text-danger text-center">Error loading data.</p>';
    }
}

window.resolveIssue = async function(docId) {
    if(!confirm("Mark this issue as resolved and remove it?")) return;
    try { 
        await deleteDoc(doc(db, "reports", docId)); 
        loadDashboard(); 
    } catch(e) { 
        alert("Error deleting: " + e.message); 
    }
}