export function getFavorites() {
  
  return JSON.parse(
    localStorage.getItem("favorites")
  ) || [];
  
}

export function isFavorite(id) {
  
  return getFavorites().includes(id);
  
}

export function toggleFavorite(id) {
  
  let favorites = getFavorites();
  
  if (favorites.includes(id)) {
    
    favorites = favorites.filter(item => item !== id);
    
  } else {
    
    favorites.push(id);
    
  }
  
  localStorage.setItem(
    "favorites",
    JSON.stringify(favorites)
  );
  
  return favorites.includes(id);
  
}