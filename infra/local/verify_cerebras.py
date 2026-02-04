import os
import sys
from openai import OpenAI

# Load keys
api_key = os.getenv("CEREBRAS_API_KEY")
if not api_key:
    print("❌ CEREBRAS_API_KEY not found in environment")
    sys.exit(1)

print(f"🔑 Testing Cerebras API with key: {api_key[:4]}...{api_key[-4:]}")

try:
    client = OpenAI(
        base_url="https://api.cerebras.ai/v1",
        api_key=api_key,
    )

    response = client.chat.completions.create(
        model="llama3.1-8b",
        messages=[
            {"role": "user", "content": "Return the word 'CONNECTED' and nothing else."}
        ],
    )
    
    content = response.choices[0].message.content.strip()
    print(f"🤖 Response: {content}")
    
    if "CONNECTED" in content:
        print("✅ Cerebras API Verification: SUCCESS")
    else:
        print("⚠️ Cerebras API Verification: UNEXPECTED RESPONSE")

except Exception as e:
    print(f"❌ Cerebras API Verification: FAILED - {str(e)}")
    sys.exit(1)
