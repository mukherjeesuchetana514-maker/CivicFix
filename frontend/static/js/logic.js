import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
// 🟢 ADDED 'query' and 'where' to imports for filtering user reports
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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

// 🟢 NEW HELPER: Open Image safely without redirecting
window.openImage = function(imgData) {
    if(!imgData || imgData === '#' || imgData.length < 100) {
        showPopup("No Image", "This report has no valid image.", "info");
        return;
    }
    const w = window.open("");
    w.document.write(`<img src="${imgData}" style="width:100%; max-width:800px;">`);
}

// 🟢 NEW FIX: COMPRESS IMAGE TO FIT IN DATABASE
// This shrinks the image to 800px width and 60% quality to ensure it is under 1MB
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

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const currentPoints = userSnap.data().civicPoints || 0;
        await updateDoc(userRef, {
            civicPoints: currentPoints + points
        });
    }
}





// Report Action
if(reportBtn) {
    reportBtn.addEventListener('click', async () => {
        if (!fileToAnalyze) return;

        // UI Updates
        loading.style.display = 'block';
        reportBtn.disabled = true;

        // GET GPS LOCATION
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                try {
                    // 🟢 1. COMPRESS IMAGE BEFORE SENDING (Solves 'File too large' and 'toBase64' errors)
                    const compressedImage = await compressImage(fileToAnalyze);

                    // 2. STEP 1: EDGE AI
                    let tfResultText = "No obstacles detected.";
                    if (tfModel) {
                        const imgForTf = document.getElementById('preview');
                        const predictions = await tfModel.detect(imgForTf);
                        if (predictions.length > 0) {
                            const objects = predictions.map(p => p.class).join(", ");
                            tfResultText = `Found: ${objects}`;
                        }
                    }

                    // 3. STEP 2: BACKEND AI (Gemini)
                    const formData = new FormData();
                    formData.append("image", fileToAnalyze);
                    
                    const response = await fetch('/api/analyze', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const data = await response.json();
                    if(data.error) throw new Error(data.error);
                    const geminiText = data.result;

                    // Standard Google Maps URL
                    const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;

                    // 🟢 4. STEP 3: SAVE TO FIREBASE (USING COMPRESSED IMAGE)
                    await addDoc(collection(db, "reports"), {
                        issue: geminiText,
                        imageUrl: compressedImage, // ✅ Saving small compressed image
                        tf_detection: tfResultText,
                        severity: "High", 
                        status: "Pending", 
                        adminComment: "",
                        location: { lat: lat, lng: lng },
                        googleMapsLink: mapUrl,
                        timestamp: serverTimestamp(),
                        userEmail: currentUser ? currentUser.email : "Anonymous"
                    });

                    // use of civic point add function
                    if (currentUser && currentUser.uid) {
                        await addCivicPoints(currentUser, 10);
                    }

                    // lode civic point
                    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                    document.getElementById("civic-points").innerText =
                    userDoc.data().civicPoints || 0;


                    // STEP 4: SHOW RESULT
                    aiText.innerHTML = `
                        <div class="alert alert-secondary py-1 mb-2" style="font-size:0.9em">⚡ <strong>Edge AI:</strong> ${tfResultText}</div>
                        <strong>Vertex AI Analysis:</strong> ${geminiText}<br><br>
                        📍 <strong>Location:</strong> <a href="${mapUrl}" target="_blank" style="color:var(--primary-color); font-weight:bold;">View on Google Maps</a>
                        <p style="font-color:rgb(20,231,20); font-weight: bolder;">CONGRATULATION!!!!</P>
                        <p>YOU GAIN  10 CIVIC POINT</p>
                    `;
                    
                    loading.style.display = 'none';
                    resultDiv.style.display = 'block';
                    
                    showPopup("Report Sent!", "Track status in 'My Reports'.", "success");

                } catch (error) {
                    console.error("Error:", error);
                    loading.style.display = 'none';
                    showPopup("Error", "Analysis Failed: " + error.message, "error");
                    reportBtn.disabled = false;
                }
            }, () => {
                loading.style.display = 'none';
                showPopup("Location Error", "We need your location to file a report.", "error");
                reportBtn.disabled = false;
            });
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
    const orgName = document.getElementById('loginOrg').value;

    // 1. OFFICIAL LOGIN
    if (currentLoginType === 'official') {
        if (!orgName) { showPopup("Missing Info", "Please enter Municipality Name", "warning"); return; }
        
        try {
            // Check hardcoded admin OR real firebase login
            let isHardcoded = (email === "admin@civicfix.com" && pass === "admin123");
            
            if(!isHardcoded) {
                // Try real login
                const userCredential = await signInWithEmailAndPassword(auth, email, pass);
                // Check if this user is actually an official in our DB
                const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
                if (userDoc.exists() && userDoc.data().role === 'official') {
                    currentUser = { email: email, role: 'official', org: userDoc.data().org };
                } else {
                    throw new Error("Not registered as an Official account.");
                }
            } else {
                currentUser = { email: email, role: 'official', org: orgName };
            }

            // Switch to Admin Dashboard
            document.getElementById('nav-citizen').style.display = 'none';
            document.getElementById('nav-official').style.display = 'flex';
            document.getElementById('org-name-display').innerText = `🏛️ ${currentUser.org}`;
            
            bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
            showSection('admin-section');
            loadDashboard();
            
            showPopup("Welcome Official", `Logged in to ${currentUser.org}`, "success");

        } catch (error) {
            showPopup("Login Failed", error.message, "error");
        }
        return;
    }

    // 2. CITIZEN LOGIN
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        currentUser = userCredential.user;
        
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'block';
        
        bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
        showPopup("Welcome!", "Login Successful.", "success");
        showSection('report-section');

        // lode civic point 
                    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                    document.getElementById("civic-points").innerText =
                    userDoc.data().civicPoints || 0;

    } catch (error) {
        showPopup("Login Failed", error.message, "error");
    }
}

// B. HANDLE SIGNUP
window.handleSignup = async function() {
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPass').value;
    const name = document.getElementById('signupName').value;
    const orgName = document.getElementById('signupOrg').value;

    try {
        // Create Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = userCredential.user.uid;

        if (currentLoginType === 'official') {
            if(!orgName) throw new Error("Municipality Name is required for officials.");
            
            // SAVE OFFICIAL DATA TO DATABASE
            await setDoc(doc(db, "users", uid), {
                name: name,
                email: email,
                role: 'official',
                org: orgName,
                createdAt: serverTimestamp()
            });

            currentUser = { email: email, role: 'official', org: orgName };
            
            // Switch to Admin Dashboard immediately
            document.getElementById('nav-citizen').style.display = 'none';
            document.getElementById('nav-official').style.display = 'flex';
            document.getElementById('org-name-display').innerText = `🏛️ ${orgName}`;
            
            bootstrap.Modal.getInstance(document.getElementById('signupModal')).hide();
            showSection('admin-section');
            loadDashboard();
            showPopup("Account Created", "Welcome, Official! Dashboard ready.", "success");

        } else {
            // SAVE CITIZEN DATA
            await setDoc(doc(db, "users", uid), {
                name: name,
                email: email,
                role: 'citizen',
                civicPoints: 0,
                createdAt: serverTimestamp()
            });

            // lode civic point
            const userDoc = await getDoc(doc(db, "users", uid));
            document.getElementById("civic-points").innerText =
            userDoc.data().civicPoints || 0;

            currentUser = userCredential.user;
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'block';

            bootstrap.Modal.getInstance(document.getElementById('signupModal')).hide();
            showPopup("Account Created!", "Welcome to CivicFix.", "success");
            showSection('report-section');
        }

    } catch (error) {
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
    
    try {
        // Query: Show only reports by this user
        const q = query(collection(db, "reports"), where("userEmail", "==", currentUser.email));
        const querySnapshot = await getDocs(q);
        let html = "";
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : "Just now";
            let statusColor = data.status === "Resolved" ? "bg-success" : (data.status === "In Progress" ? "bg-primary" : "bg-warning");
            
            // 🟢 IMAGE AS BACKGROUND
            let bgImage = data.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image+Available';

            // Render Official Reply if it exists
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
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    
    try {
        const querySnapshot = await getDocs(collection(db, "reports"));
        let html = "";
        let count = 0;
        
        querySnapshot.forEach((doc) => {
            count++;
            const data = doc.data();
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

            // 🟢 IMAGE AS BACKGROUND
            let bgImage = data.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image+Available';
            
            // 🟢 BUTTON WITH ONCLICK (NO REDIRECT)
            let viewBtn = `<button onclick="openImage('${data.imageUrl}')" class="btn btn-sm btn-outline-secondary w-50 rounded-pill">View Photo</button>`;

            html += `
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-0 rounded-4">
                    <div style="height: 220px; background-image: url('${bgImage}'); background-size: cover; background-position: center; border-radius: 16px 16px 0 0; position: relative;">
                        <span class="badge ${statusColor} position-absolute top-0 end-0 m-3 px-3 py-2 shadow-sm" id="badge-${doc.id}">${data.status || "Pending"}</span>
                    </div>
                    
                    <div class="card-body">
                        <small class="text-muted d-block mb-2">📅 ${date}</small>
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
        });
        
        container.innerHTML = html || '<div class="text-center text-muted">No pending reports!</div>';
        document.getElementById('total-reports').innerText = count;
        
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