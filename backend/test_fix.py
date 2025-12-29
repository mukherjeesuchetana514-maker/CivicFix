import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

print("🔍 Scanning for available models...")
print("-" * 50)

found_any = False
try:
    # Ask Google for the list
    for m in genai.list_models():
        # Check if the model can generate content (text/images)
        if 'generateContent' in m.supported_generation_methods:
            print(f"✅ AVAILABLE: {m.name}")
            found_any = True
            
            # Suggest the best one
            if 'flash' in m.name:
                print(f"   ---> RECOMMENDATION: Use '{m.name}' in app.py")
            elif 'vision' in m.name:
                print(f"   ---> GOOD ALTERNATIVE: Use '{m.name}' in app.py")

except Exception as e:
    print(f"❌ Error scanning models: {e}")

if not found_any:
    print("❌ No models found. Your API Key might be invalid or has no access.")
print("-" * 50)