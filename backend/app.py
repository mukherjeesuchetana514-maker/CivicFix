import os
import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# --- OLD (STABLE) GEMINI LIBRARY ---
import google.generativeai as genai

# --- FIREBASE IMPORTS ---
import firebase_admin
from firebase_admin import credentials, firestore

# 1. Load Environment Variables
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

# 2. Configure Gemini (STABLE WAY)
if API_KEY:
    genai.configure(api_key=API_KEY)

    model = genai.GenerativeModel('gemini-flash-latest')

else:
    print("⚠️ WARNING: GEMINI_API_KEY not found in .env")

# 3. Setup Flask
app = Flask(__name__, 
            template_folder="../frontend/templates",
            static_folder="../frontend/static")
CORS(app)

# 4. Setup Firebase (ABSOLUTE PATH FIX)
base_dir = os.path.dirname(os.path.abspath(__file__))
key_path = os.path.join(base_dir, "serviceAccountKey.json")

print(f"🔍 Looking for key at: {key_path}")

if not firebase_admin._apps:
    try:
        if not os.path.exists(key_path):
            # This prevents the confusing 'ValueError' later
            raise FileNotFoundError(f"CRITICAL: Key file not found at {key_path}")

        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Connected Successfully")
    except Exception as e:
        print(f"❌ Firebase Init Error: {e}")
        exit(1)

db = firestore.client()
users_ref = db.collection('users')
reports_ref = db.collection('reports')

# Route: Serve HTML
@app.route('/')
def home():
    return render_template('index.html')

# --- AUTHENTICATION ---

@app.route('/api/signup', methods=['POST'])
def signup():
    try:
        data = request.json
        email = data.get('email')
        
        docs = users_ref.where('email', '==', email).stream()
        if any(docs):
            return jsonify({"status": "error", "message": "Email already exists"}), 400

        new_user = {
            "name": data.get('name'),
            "email": email,
            "password": data.get('password'),
            "role": data.get('role', 'citizen'),
            "zone_type": data.get('zone_type'), 
            "zone_name": data.get('zone_name').strip().title(), 
            "civic_points": 0
        }
        
        users_ref.add(new_user)
        return jsonify({"status": "success", "message": "Account created!"})
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        role = data.get('role')

        docs = users_ref.where('email', '==', email).stream()
        user_data = None
        user_id = None
        
        for doc in docs:
            user_data = doc.to_dict()
            user_id = doc.id
            break

        if user_data:
            # ✅ SAFE VERSION: Uses .get() to avoid crashing
            stored_password = user_data.get('password')
            
            if not stored_password:
                return jsonify({"status": "error", "message": "Account corrupted: No password set. Please register again."}), 400
                
            if stored_password != password:
                return jsonify({"status": "error", "message": "Incorrect password"}), 401
            
            
            
            if user_data.get('role') != role:
                return jsonify({"status": "error", "message": f"Please login as {user_data.get('role')}"}), 403

            return jsonify({
                "status": "success",
                "message": "Login successful",
                "name": user_data['name'],
                "role": user_data['role'],
                "user_id": user_id,
                "zone_name": user_data.get('zone_name', ''),
                "zone_type": user_data.get('zone_type', '') 
            })
        else:
            return jsonify({"status": "error", "message": "User not found"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- REPORTING LOGIC (Using Old Gemini Syntax) ---

@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image uploaded"}), 400
        
        file = request.files['image']
        img_data = file.read()
        
        # Prepare content for old library
        # It handles images differently (list of dicts)
        image_part = {
            "mime_type": "image/jpeg",
            "data": img_data
        }
        prompt = "Analyze this image for civic issues (garbage, pothole, bad road). Identify the issue and assign a Severity Score (1-10). Keep it short."
        
        response = model.generate_content([prompt, image_part])
        
        return jsonify({"result": response.text})
    except Exception as e:
        print(f"AI Error: {e}")
        return jsonify({"error": str(e)}), 500

# Route: Submit Report (For Firebase)
@app.route('/api/submit_report', methods=['POST'])
def submit_report():
    try:
        data = request.json
        report_data = {
            "user_email": data.get('email'),
            "issue_text": data.get('issue'),
            "zone_name": data.get('zone_name'),
            "status": "Pending",
            "timestamp": datetime.datetime.now().isoformat()
        }
        reports_ref.add(report_data)
        return jsonify({"status": "success"})
    except Exception as e:
        print(e)
        return jsonify({"status": "error"}), 500

# --- OFFICIAL DASHBOARD ROUTES ---

@app.route('/api/get_official_data', methods=['POST'])
def get_official_data():
    try:
        data = request.json
        official_zone = data.get('zone_name')
        
        reports = reports_ref.where('zone_name', '==', official_zone).stream()
        report_list = [r.to_dict() for r in reports]
        
        return jsonify({"reports": report_list})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_contributors', methods=['POST'])
def get_contributors():
    try:
        data = request.json
        official_zone = data.get('zone_name')
        
        users = users_ref.where('zone_name', '==', official_zone)\
                         .where('role', '==', 'citizen')\
                         .order_by('civic_points', direction=firestore.Query.DESCENDING)\
                         .stream()
        
        contributors = []
        for doc in users:
            u = doc.to_dict()
            contributors.append({
                "name": u['name'],
                "points": u.get('civic_points', 0),
                "email": u['email']
            })
            
        return jsonify({"contributors": contributors})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)