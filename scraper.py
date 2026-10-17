import json
import time
import random
import urllib.parse
import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore
import hashlib

# ⚠️ 1. إعدادات Firebase
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# ⚠️ 2. إعدادات Scrape.do (بدل التوكن!)
TOKEN = "102f8778fe7a455da07588583d19b25bc8087b568d8"
TARGET_URL = "https://www.carrefour.fr/s?q=lait"

def generate_source_id(name, store):
    text = f"{store}_{name}".lower().strip()
    return hashlib.md5(text.encode('utf-8')).hexdigest()

def scrape_carrefour():
    try:
        time.sleep(random.uniform(1, 3))
        encoded_url = urllib.parse.quote(TARGET_URL)
        api_url = f"https://api.scrape.do/?token={TOKEN}&url={encoded_url}&render=true&super=true"

        print("⏳ كنصيفط الطلب لـ Scrape.do...")
        response = requests.get(api_url, timeout=60)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')
        articles = soup.find_all('article')
        products_saved = 0
        products_skipped = 0

        print(f"✅ لقينا {len(articles)} منتج. غادي نبداو التسجيل...")

        for article in articles:
            name_tag = article.find('h3')
            if not name_tag:
                continue
            name = name_tag.text.strip()

            price = "غير معروف"
            price_tag = article.find('p', class_='product-list-card-plp-grid__shimmer-base-price')
            if price_tag:
                price = price_tag.text.strip()

            image = ""
            img_tag = article.find('img')
            if img_tag and img_tag.get('src'):
                image = img_tag.get('src')
                if image.startswith('//'):
                    image = 'https:' + image

            source_url = TARGET_URL
            link_tag = article.find('a')
            if link_tag and link_tag.get('href'):
                source_url = "https://www.carrefour.fr" + link_tag.get('href')

            source_id = generate_source_id(name, "Carrefour")

            existing = db.collection('hypermarket_products').where('source_id', '==', source_id).limit(1).get()
            if len(existing) > 0:
                products_skipped += 1
                continue

            product_data = {
                'name': name,
                'price': price,
                'image': image,
                'source_url': source_url,
                'store': 'Carrefour',
                'chain': 'carrefour',
                'status': 'pending_review',
                'source_id': source_id,
                'imported_at': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP
            }

            db.collection('hypermarket_products').add(product_data)
            products_saved += 1
            print(f"  ✅ تسجل: {name} - {price}")

        print(f"\n📊 النتيجة النهائية: {products_saved} منتج جديد، {products_skipped} منتج مكرر")

    except Exception as e:
        print(f"❌ وقع مشكل: {e}")

if __name__ == "__main__":
    print("⏳ بدا السحب...")
    scrape_carrefour()
    print("✅ سالا السحب!")