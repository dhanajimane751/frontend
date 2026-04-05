import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import io from "socket.io-client";
import Peer from "simple-peer";
import {
  Mic, MicOff,
  Video as VideoIcon, VideoOff,
  PhoneOff, Copy, Check, Users
} from "lucide-react";

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// ─── Remote video tile ─────────────────────────────────────────────────────
// Uses a clean stream event listener and also a local state to ensure the stream
// is attached correctly even after potential re-renders.
const PeerVideo = memo(({ peer, name }) => {
  const ref = useRef();

  useEffect(() => {
    const attachStream = (stream) => {
      if (ref.current) {
        ref.current.srcObject = stream;
      }
    };

    // If stream is already available, attach it.
    if (peer.streams && peer.streams[0]) {
      attachStream(peer.streams[0]);
    }

    // Listen for the stream event.
    peer.on("stream", attachStream);

    return () => {
      peer.off("stream", attachStream);
    };
  }, [peer]);

  return (
    <div className="video-wrapper">
      <video playsInline autoPlay ref={ref} className="peer-video" />
      <span className="name-badge">{name || "Guest"}</span>
    </div>
  );
});

// ─── Room Component ────────────────────────────────────────────────────────
function Room() {
  const { roomID }   = useParams();
  const navigate     = useNavigate();
  const location     = useLocation();

  const [userName, setUserName] = useState(
    location.state?.userName || localStorage.getItem("cm_name") || "Guest"
  );

  const [peers, setPeers] = useState([]);      // Array of: { peerID, peer, name }
  const [hasVideo, setHasVideo] = useState(true);
  const [hasAudio, setHasAudio] = useState(true);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("Connecting…");

  const socketRef = useRef(null);
  const userVideo = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef([]);      // Reference to manage array: { peerID, peer, name }

  // Cleanup: Stops tracks and disconnects socket.
  const fullTeardown = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    peersRef.current.forEach((p) => {
      try { p.peer.destroy(); } catch (e) { console.error("Peer destroy error:", e); }
    });
    peersRef.current = [];
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    // 1. Initialize socket.
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    setStatus("Requesting permissions…");

    // 2. Request user media.
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (userVideo.current) userVideo.current.srcObject = stream;

        // 3. Emit join-room once connected and media is ready.
        const sendJoin = () => {
          setStatus("Joining room…");
          socket.emit("join-room", { roomId: roomID, userName });
        };

        if (socket.connected) {
          sendJoin();
        } else {
          socket.once("connect", sendJoin);
        }

        // ── Listener: existing users already in the room ──
        socket.on("all-users", (users) => {
          setStatus(users.length > 0 ? `${users.length + 1} people here` : "Waiting for others…");

          const newPeersArray = users.map(({ id, name: peerName }) => {
            const peer = new Peer({ initiator: true, trickle: false, stream });

            peer.on("signal", (signal) => {
              socket.emit("sending-signal", { userToSignal: id, callerID: socket.id, signal });
            });

            peer.on("error", (err) => console.error("Initiator Peer Error:", err));

            const entry = { peerID: id, peer, name: peerName };
            peersRef.current.push(entry);
            return entry;
          });

          setPeers(newPeersArray);
        });

        // ── Listener: a new user joined and sent us an offer ──
        socket.on("user-joined", (payload) => {
          const { signal, callerID, callerName } = payload;
          if (peersRef.current.find(p => p.peerID === callerID)) return;

          const peer = new Peer({ initiator: false, trickle: false, stream });

          peer.on("signal", (retSignal) => {
            socket.emit("returning-signal", { signal: retSignal, callerID });
          });

          peer.on("error", (err) => console.error("Receiver Peer Error:", err));

          // Signal the incoming offer.
          peer.signal(signal);

          const entry = { peerID: callerID, peer, name: callerName || "Guest" };
          peersRef.current.push(entry);
          setPeers((prev) => [...prev, entry]);
          setStatus(`${peersRef.current.length + 1} people here`);
        });

        // ── Listener: initiator receives the answer back ──
        socket.on("receiving-returned-signal", (payload) => {
          const { signal, id, name } = payload;
          const found = peersRef.current.find(p => p.peerID === id);
          if (found) {
            found.name = name || found.name;
            try {
              found.peer.signal(signal);
            } catch (err) {
              console.error("Signal error:", err);
            }
            // Trigger state refresh for names.
            setPeers((prev) => prev.map(p => p.peerID === id ? { ...p, name: found.name } : p));
          }
        });

        // ── Listener: user disconnected ──
        socket.on("user-disconnected", (id) => {
          const peerObj = peersRef.current.find(p => p.peerID === id);
          if (peerObj) {
            try { peerObj.peer.destroy(); } catch (e) {}
          }
          peersRef.current = peersRef.current.filter(p => p.peerID !== id);
          setPeers((prev) => prev.filter(p => p.peerID !== id));
          setStatus(peersRef.current.length > 0 ? `${peersRef.current.length + 1} people here` : "Waiting for others…");
        });
      })
      .catch((err) => {
        console.error("Media Error:", err);
        setStatus("❌ Access Denied");
        alert("Camera and microphone access is required.");
      });

    return () => {
      fullTeardown();
    };
  }, [roomID, userName, fullTeardown]);

  const toggleAudio = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setHasAudio(track.enabled); }
  };

  const toggleVideo = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setHasVideo(track.enabled); }
  };

  const leaveRoom = () => { navigate("/"); };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const participantCount = peers.length + 1;

  return (
    <div className="room-container">
      {/* ── Header ── */}
      <div className="room-header">
        <div className="room-info">
          <span className="brand">ConnectMeet</span>
          <span className="divider">|</span>
          <span className="room-id-text">{roomID.substring(0, 8)}…</span>
          <button className="copy-btn" onClick={copyLink}>
            {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
        <div className="header-right">
          <span className="people-badge">
            <Users size={14} /> {participantCount} {participantCount === 1 ? "person" : "people"}
          </span>
          <span className="status-badge">{status}</span>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="video-grid">
        {/* Local Stream */}
        <div className="video-wrapper">
          <video muted ref={userVideo} autoPlay playsInline />
          {!hasVideo && (
            <div className="video-off-overlay">
              <VideoOff size={40} />
              <p>Camera off</p>
            </div>
          )}
          <span className="name-badge">{userName} (You) {!hasAudio && "🔇"}</span>
        </div>

        {/* Remote Streams */}
        {peers.map((p) => (
          <PeerVideo key={p.peerID} peer={p.peer} name={p.name} />
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="controls-bar">
        <button className={`control-btn ${!hasAudio ? "btn-off" : ""}`} onClick={toggleAudio}>
          {hasAudio ? <Mic size={20} /> : <MicOff size={20} />}
          <span className="ctrl-label">{hasAudio ? "Mute" : "Unmute"}</span>
        </button>
        <button className={`control-btn ${!hasVideo ? "btn-off" : ""}`} onClick={toggleVideo}>
          {hasVideo ? <VideoIcon size={20} /> : <VideoOff size={20} />}
          <span className="ctrl-label">{hasVideo ? "Off" : "On"}</span>
        </button>
        <button className="control-btn btn-end" onClick={leaveRoom}>
          <PhoneOff size={20} />
          <span className="ctrl-label">Leave</span>
        </button>
      </div>
    </div>
  );
}

export default Room;
