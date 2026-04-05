import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { Video, Keyboard, User } from "lucide-react";

function Home() {
  const [userName, setUserName] = useState(
    () => localStorage.getItem("cm_name") || ""
  );
  const [roomIdToJoin, setRoomIdToJoin] = useState("");
  const navigate = useNavigate();

  const saveName = (name) => {
    setUserName(name);
    localStorage.setItem("cm_name", name);
  };

  const resolvedName = userName.trim() || "Guest";

  const createMeeting = () => {
    localStorage.setItem("cm_name", resolvedName);
    navigate(`/room/${uuidv4()}`, { state: { userName: resolvedName } });
  };

  const joinMeeting = (e) => {
    e.preventDefault();
    const input = roomIdToJoin.trim();
    if (!input) return;

    let roomId = input;
    try {
      const url = new URL(input);
      const match = url.pathname.match(/\/room\/(.+)/);
      if (match?.[1]) roomId = match[1];
    } catch { /* raw room code */ }

    localStorage.setItem("cm_name", resolvedName);
    navigate(`/room/${roomId}`, { state: { userName: resolvedName } });
  };

  return (
    <div className="home-container">
      <div className="home-header">
        <div className="logo-container">
          <div className="logo-icon"><Video size={22} /></div>
          <h2>ConnectMeet</h2>
        </div>
        <p className="subtitle">Premium video calling for everyone.</p>
      </div>

      {/* ── Name input ── */}
      <div className="name-box">
        <div className="name-input-wrap">
          <User size={16} className="name-icon" />
          <input
            type="text"
            className="name-input"
            placeholder="Enter your name (optional)"
            value={userName}
            onChange={(e) => saveName(e.target.value)}
            maxLength={30}
          />
        </div>
      </div>

      <div className="action-cards">
        <div className="card">
          <div className="card-icon"><Video size={30} /></div>
          <h3>Start an instant meeting</h3>
          <p>Get a link you can share with your peers to join immediately.</p>
          <button className="primary-btn" onClick={createMeeting}>
            New Meeting
          </button>
        </div>

        <div className="card">
          <div className="card-icon"><Keyboard size={30} /></div>
          <h3>Join a meeting</h3>
          <p>Have a meeting code or link? Enter it below to join the call.</p>
          <form className="join-form" onSubmit={joinMeeting}>
            <input
              type="text"
              placeholder="Enter a code or link"
              value={roomIdToJoin}
              onChange={(e) => setRoomIdToJoin(e.target.value)}
            />
            <button className="secondary-btn" type="submit" disabled={!roomIdToJoin.trim()}>
              Join
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Home;
