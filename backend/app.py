import os
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai

# 1. Load Environment Variables
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

# 2. Configure Gemini
if API_KEY:
    genai.configure(api_key=API_KEY)
    model = genai.GenerativeModel('gemini-2.5-flash')
else:
    print("⚠️ WARNING: GEMINI_API_KEY not found in .env")

# 3. Setup Flask (Pointing to Frontend folders)
app = Flask(__name__, 
            template_folder="../frontend/templates",
            static_folder="../frontend/static")
CORS(app)

# Route: Serve the HTML Page
@app.route('/')
def home():
    return render_template('index.html')

# Route: Handle AI Analysis (Called by logic.js)
@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image uploaded"}), 400
        
        file = request.files['image']
        img_data = file.read()
        
        prompt = "Analyze this image for civic issues (garbage, pothole, bad road). Identify the issue and assign a Severity Score (1-10). Keep it short."
        
        response = model.generate_content([
            {'mime_type': 'image/jpeg', 'data': img_data},
            prompt
        ])
        
        return jsonify({"result": response.text})
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)