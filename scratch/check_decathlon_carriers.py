import urllib.request
import json

api_key = "e94d18dd-21f1-4396-979c-3177d3a1a93e"
base_url = "https://marketplace-decathlon-eu.mirakl.net"

def main():
    url = f"{base_url}/api/shipping/carriers"
    req = urllib.request.Request(url)
    req.add_header("Authorization", api_key)
    req.add_header("Accept", "application/json")
    
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode('utf-8')
            data = json.loads(body)
            carriers = data.get("carriers", [])
            for c in carriers:
                code = c.get("code", "")
                label = c.get("label", "")
                if "dhl" in code.lower() or "dhl" in label.lower() or "hermes" in code.lower() or "hermes" in label.lower():
                    print(f"Code: {code} | Label: {label} | Standard Code: {c.get('standard_code')}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
