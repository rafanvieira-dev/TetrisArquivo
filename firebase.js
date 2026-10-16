import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, runTransaction,
  query, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyATeOsBTqIQw47scF1rWhPOacUFe8uSqhg",
  authDomain: "tetrisarquivo.firebaseapp.com",
  projectId: "tetrisarquivo",
  storageBucket: "tetrisarquivo.firebasestorage.app",
  messagingSenderId: "458039691482",
  appId: "1:458039691482:web:d42f4f8012cf6b71ab7de3",
  measurementId: "G-P32MH786PV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const loginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("googleLogoutBtn");
const userName = document.getElementById("userName");
const authStatus = document.getElementById("authStatus");
const avatar = document.getElementById("userAvatar");
const initial = document.getElementById("userInitial");
const leaderboardList = document.getElementById("leaderboardList");
const rankingMessage = document.getElementById("rankingMessage");

let currentUser = null;
let unsubscribeLeaderboard = null;

function setMessage(message, isError = false) {
  rankingMessage.textContent = message;
  rankingMessage.style.color = isError ? "#f19a8f" : "";
}

function safeText(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderLeaderboard(snapshot) {
  leaderboardList.replaceChildren();
  if (snapshot.empty) {
    leaderboardList.append(safeText("li", "ranking-empty", "Ainda não há pontuações. Seja o primeiro!"));
    return;
  }
  snapshot.docs.forEach((entry, index) => {
    const data = entry.data();
    const item = document.createElement("li");
    item.append(safeText("span", "rank-number", String(index + 1)));
    if (data.photoURL) {
      const image = document.createElement("img");
      image.className = "rank-avatar";
      image.src = data.photoURL;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.onerror = () => {
        const fallback = safeText("span", "rank-initial", (data.displayName || "?").trim().charAt(0).toUpperCase());
        image.replaceWith(fallback);
      };
      item.append(image);
    } else {
      item.append(safeText("span", "rank-initial", (data.displayName || "?").trim().charAt(0).toUpperCase()));
    }
    item.append(safeText("span", "rank-name", data.displayName || "Jogador"));
    item.append(safeText("strong", "rank-score", Number(data.score || 0).toLocaleString("pt-BR")));
    leaderboardList.append(item);
  });
}

function watchLeaderboard() {
  if (unsubscribeLeaderboard) unsubscribeLeaderboard();
  const leaderboardQuery = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(20));
  unsubscribeLeaderboard = onSnapshot(leaderboardQuery, renderLeaderboard, error => {
    console.error("Falha ao carregar ranking:", error);
    leaderboardList.replaceChildren(safeText("li", "ranking-empty", "Não foi possível carregar o ranking."));
    setMessage("Confira se o Firestore foi criado e se as regras foram publicadas.", true);
  });
}

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
    setMessage("");
  } catch (error) {
    console.error("Falha no login Google:", error);
    setMessage(error.code === "auth/unauthorized-domain"
      ? "Domínio não autorizado. Adicione rafanvieira-dev.github.io no Firebase Authentication."
      : "Não foi possível entrar com Google. Confira se o provedor está ativado.", true);
  }
});

logoutBtn.addEventListener("click", async () => {
  try { await signOut(auth); }
  catch (error) { console.error(error); setMessage("Não foi possível sair da conta.", true); }
});

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    userName.textContent = user.displayName || user.email || "Jogador";
    authStatus.textContent = "Conectado — seu recorde será salvo no ranking";
    initial.classList.add("hidden");
    avatar.classList.remove("hidden");
    if (user.photoURL) {
      avatar.src = user.photoURL;
      avatar.onerror = () => { avatar.classList.add("hidden"); initial.classList.remove("hidden"); };
    } else {
      avatar.removeAttribute("src");
      avatar.classList.add("hidden");
      initial.classList.remove("hidden");
    }
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    userName.textContent = "Visitante";
    authStatus.textContent = "Entre para salvar seu recorde no ranking global";
    avatar.classList.add("hidden");
    avatar.removeAttribute("src");
    initial.textContent = "?";
    initial.classList.remove("hidden");
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
});

watchLeaderboard();

window.addEventListener("tetris:gameover", async event => {
  const score = Number(event.detail?.score || 0);
  if (!currentUser) {
    setMessage(score > 0 ? "Entre com Google para registrar seu recorde no ranking." : "");
    return;
  }
  if (!Number.isSafeInteger(score) || score < 0) return;

  const user = currentUser;
  const userRef = doc(db, "leaderboard", user.uid);
  try {
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(userRef);
      const previousScore = existing.exists() ? Number(existing.data().score || 0) : -1;
      if (score <= previousScore) return;
      transaction.set(userRef, {
        uid: user.uid,
        displayName: (user.displayName || user.email || "Jogador").slice(0, 80),
        photoURL: user.photoURL || "",
        score,
        updatedAt: serverTimestamp()
      });
    });
    setMessage("Partida encerrada. Seu melhor resultado foi verificado e atualizado quando necessário.");
  } catch (error) {
    console.error("Falha ao salvar pontuação:", error);
    setMessage("Não foi possível salvar. Confira as regras do Firestore.", true);
  }
});
