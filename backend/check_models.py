import os
from dotenv import load_dotenv
from google import genai

# Load your API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ Error: GEMINI_API_KEY not found in .env")
    exit()

client = genai.Client(api_key=api_key)

print("🔍 Checking available models for your API Key...")
print("-" * 40)

try:
    # List all models available to you
    for model in client.models.list():
        # We only care about models that can 'generateContent'
        if 'generateContent' in model.supported_generation_methods:
            print(f"✅ {model.name}")
            
except Exception as e:
    print(f"❌ Error: {e}")