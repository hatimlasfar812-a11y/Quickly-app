import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

def approve_all():
    print("⏳ كنقلب على المنتجات اللي قيد المراجعة...")
    products_ref = db.collection('hypermarket_products')
    pending_products = products_ref.where('status', '==', 'pending_review').get()
    
    if not pending_products:
        print("⚠️ ما كاين حتى منتج قيد المراجعة.")
        return

    print(f"✅ لقيت {len(pending_products)} منتج. غادي نبداو الموافقة...")
    
    batch = db.batch()
    count = 0
    
    for doc in pending_products:
        batch.update(doc.reference, {'status': 'approved'})
        count += 1
        if count % 400 == 0: 
            batch.commit()
            batch = db.batch()
            print(f"   ✅ تمت الموافقة على {count} منتج...")
            
    batch.commit()
    print(f"🎉 مبروك! تمت الموافقة على {len(pending_products)} منتج بنجاح.")

if __name__ == "__main__":
    approve_all()