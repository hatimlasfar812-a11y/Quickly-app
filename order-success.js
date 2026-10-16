const id =
localStorage.getItem("lastOrderId");

document.getElementById("orderNumber").textContent =
id ?
id.slice(0,8).toUpperCase()
:
"UNKNOWN";