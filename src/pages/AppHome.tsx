import { useNavigate } from "react-router-dom";

export default function AppHome() {
  const navigate = useNavigate();
  const address = localStorage.getItem("wallet_address");
  const did = localStorage.getItem("did");

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <div className="app-wrap">
      <header className="app-header">
        <h2>Welcome 🎉</h2>
        <button className="secondary" onClick={logout}>Logout</button>
      </header>
      <main>
        <div className="user-card">
          <h3>Your Wallet Details</h3>
          <p><strong>DID:</strong> {did}</p>
          <p><strong>Wallet Address:</strong> {address}</p>
        </div>
      </main>
    </div>
  );
}
