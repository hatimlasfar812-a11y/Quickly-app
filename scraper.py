import time
import random
import urllib.parse
import json
import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore
import hashlib
import re

# ⚠️ 1. إعدادات Firebase
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# ⚠️ 2. إعدادات Scrape.do (حط التوكن الجديد هنا)
TOKEN = "102f8778fe7a455da07588583d19b25bc8087b568d8"

TARGET_TOTAL = 1000 
BASE_URL = "https://www.carrefour.ma/catalogsearch/result/?q=lait" 

def generate_source_id(name, store):
    text = f"{store}_{name}".lower().strip()
    return hashlib.md5(text.encode('utf-8')).hexdigest()

def clean_price(price_text):
    if not price_text: return 0.0
    clean = re.sub(r'[^\d,.]', '', str(price_text)).replace(',', '.')
    try: return float(clean)
    except ValueError: return 0.0

def get_category(name):
    n = name.lower()
    if any(x in n for x in ['lait', 'yaourt', 'fromage', 'beurre', 'oeuf', 'حليب', 'جبن', 'زبدة', 'بيض']): return "laitiers"
    if any(x in n for x in ['boisson', 'jus', 'eau', 'coca', 'fanta', 'soda', 'café', 'thé', 'عصير', 'ماء', 'مشروب']): return "boissons"
    if any(x in n for x in ['poulet', 'viande', 'boeuf', 'dinde', 'agneau', 'poisson', 'fruit', 'legume', 'banane', 'pomme', 'tomate', 'salade', 'دجاج', 'لحم', 'سمك', 'فواكه', 'خضر']): return "frais"
    if any(x in n for x in ['chips', 'pates', 'riz', 'huile', 'sel', 'farine', 'conserve', 'زيت', 'أرز', 'فرينة', 'ملح']): return "epicerie_salee"
    if any(x in n for x in ['biscuit', 'gateau', 'chocolat', 'candy', 'sucre', 'miel', 'confiture', 'بسكويت', 'شوكولاتة', 'سكر', 'عسل']): return "epicerie_sucree"
    if any(x in n for x in ['savon', 'gel', 'shampoo', 'dent', 'lessive', 'nettoyant', 'papier', 'hygiene', 'صابون', 'شامبو', 'منظف']): return "hygiene"
    if any(x in n for x in ['bebe', 'couche', 'lait infantile', 'حفاظات', 'رضيع']): return "bebe"
    if any(x in n for x in ['chien', 'chat', 'animal', 'كلب', 'قط']): return "animaux"
    return "autres"

def fetch_with_retry(api_url, max_retries=5):
    """دالة كتعاود المحاولة إلا وقع خطأ 502"""
    for attempt in range(max_retries):
        try:
            print(f"   ⏳ محاولة {attempt + 1} من {max_retries}...")
            # كنعطيو وقت طويل للطلب باش ما يتقطعش
            response = requests.get(api_url, timeout=180) 
            
            if response.status_code == 502 or response.status_code == 504:
                print(f"   ⚠️ خطأ {response.status_code} (السيرفر مشغول). كنعاودو بعد 10 ثواني...")
                time.sleep(10 * (attempt + 1)) 
                continue
                
            response.raise_for_status()
            return response
            
        except requests.exceptions.RequestException as e:
            print(f"   ❌ فشل الطلب: {e}")
            if attempt < max_retries - 1:
                time.sleep(10 * (attempt + 1))
            else:
                return None
    return None

def scrape_carrefour_ma():
    all_products = []
    page = 1
    
    print("🚀 بدأنا جلب المنتجات من كارفور المغرب...")

    while len(all_products) < TARGET_TOTAL:
        print(f"\n--- ⏳ جلب الصفحة {page} ---")
        
        target_url = f"{BASE_URL}&p={page}"
        
        # أوامر التمرير باش يحمل الصور والمنتجات
        play_actions = [
            {"Action": "Wait", "Timeout": 3000},
            {"Action": "ScrollY", "Value": 1500},
            {"Action": "Wait", "Timeout": 2000}
        ]
        encoded_actions = urllib.parse.quote_plus(json.dumps(play_actions))
        encoded_url = urllib.parse.quote(target_url)
        
        # ⚠️ هنا زدنا geoCode=ma و customWait=5000 باش نتجاوزو الحظر
        api_url = f"https://api.scrape.do/?token={TOKEN}&url={encoded_url}&render=true&super=true&geoCode=ma&customWait=5000&playWithBrowser={encoded_actions}"
        
        response = fetch_with_retry(api_url)
        
        if not response:
            print(f"❌ فشلت جميع المحاولات فالصفحة {page}. كنوقفو باش ما نضيعوش الكريديت.")
            break

        soup = BeautifulSoup(response.text, 'html.parser')
        
        # كارفور المغرب (Magento) كيستعمل li class="product-item"
        products_list = soup.find_all('li', class_=re.compile(r'product-item')) or soup.find_all('article')
        
        if not products_list:
            print(f"⚠️ ما لقيناش منتجات فالصفحة {page}. يمكن الكتالوج سالا ولا الصفحة محظورة.")
            break
            
        print(f"✅ لقينا {len(products_list)} منتج فهاد الصفحة.")

        for item in products_list:
            if len(all_products) >= TARGET_TOTAL: break
            
            # جلب الاسم
            name_tag = item.find('a', class_=re.compile(r'product-item-link')) or item.find('h3')
            if not name_tag: continue
            name = name_tag.text.strip()
            
            # جلب الثمن
            price = 0.0
            price_tag = item.find('span', class_=re.compile(r'price'))
            if price_tag: price = clean_price(price_tag.text.strip())
            
            # جلب الصورة
            image = ""
            img_tag = item.find('img')
            if img_tag:
                image = img_tag.get('data-src') or img_tag.get('src') or ""
                if image.startswith('//'): image = 'https:' + image
            
            # جلب الرابط
            source_url = target_url
            link_tag = item.find('a', href=True)
            if link_tag:
                source_url = link_tag['href']
                if not source_url.startswith('http'):
                    source_url = "https://www.carrefour.ma" + source_url

            category = get_category(name)
            source_id = generate_source_id(name, "Carrefour")
            
            # منع التكرار
            existing = الفر db.collection('hypermarket_products').where('source_id', '==', source_id).limit(1).get()
            if len(existing) > 0: continue
            
            product_data = {
                'name': name, 
                'price': price, 
                'priceMAD': price, #ونت إند كيقرا هاد الحقل
                'image': image, 
                'source_url': source_url,
                'store': 'Carrefour', 
                'category': category,
                'status': 'pending_review', 
                'source_id': source_id,
                'imported_at': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP
            }
            
            db.collection('hypermarket_products').add(product_data)
            all_products.append(product_data)
            print(f"  ✅ [{len(all_products)}/{TARGET_TOTAL}] {name[:30]}... | {price} DH | {category}")

        page += 1
        time.sleep(random.uniform(4, 8)) # تأخير باش ما نتحظروش

    print(f"\n🎉 اكتمل الجلب! إجمالي المنتجات: {len(all_products)}")

if __name__ == "__main__":
    scrape_carrefour_ma()