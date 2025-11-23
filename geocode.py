#!/usr/bin/env python3
import requests, time, json
from pathlib import Path
EMAIL = "your-email@example.com"  # replace with a real contact email per Nominatim policy
INPUT = Path("dtes-resources.json")
OUTPUT = Path("dtes-resources.geocoded.json")
if not INPUT.exists():
    print("dtes-resources.json not found"); raise SystemExit(1)
def geocode(address):
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": address, "format":"json", "limit":1, "email": EMAIL}
    r = requests.get(url, params=params, headers={"User-Agent":"DTES-Geocoder/1.0"})
    if r.status_code==200:
        arr = r.json()
        if arr:
            return float(arr[0]['lat']), float(arr[0]['lon'])
    return None
data = json.loads(INPUT.read_text(encoding='utf-8'))
changed = False
for i,item in enumerate(data):
    if (('lat' not in item or item['lat'] is None) and item.get('address')):
        print(f"Geocoding {i+1}/{len(data)}: {item.get('name')}")
        res = geocode(item['address'])
        if res:
            item['lat'], item['lng'] = res
            print(' ->',res); changed=True
        else:
            print(' -> not found')
        time.sleep(1.1)
if changed:
    OUTPUT.write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')
    print('Wrote',OUTPUT)
else:
    print('No changes')
