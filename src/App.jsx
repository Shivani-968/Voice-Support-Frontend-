import { useState, useRef } from "react";
import { Room, RoomEvent } from "livekit-client";
import "./App.css";

function App() {
  const [status, setStatus] = useState("Disconnected");

  // Agent ka received text
  const [agentResponse, setAgentResponse] = useState("");

  // Robot speaking state
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [orderId, setOrderId] = useState("");
  const [room, setRoom] = useState(null);
  const [events, setEvents] = useState([]);

  // -----------------------------------------------
  // AUDIO REFERENCES
  // -----------------------------------------------

  const audioElementRef = useRef(null);
  const audioTrackSidRef = useRef(null);

  // Speaking timeout reference
  const speakingTimeoutRef = useRef(null);

  // -----------------------------------------------
  // ADD EVENT
  // -----------------------------------------------

  const addEvent = (message) => {
    setEvents((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        message,
      },
    ]);
  };

  // -----------------------------------------------
  // STOP SPEAKING ANIMATION
  // -----------------------------------------------

  const stopSpeakingAnimation = () => {
    if (speakingTimeoutRef.current) {
      clearTimeout(
        speakingTimeoutRef.current
      );

      speakingTimeoutRef.current = null;
    }

    setIsSpeaking(false);
  };

  // -----------------------------------------------
  // CLEANUP AUDIO
  // -----------------------------------------------

  const cleanupAudio = () => {
    stopSpeakingAnimation();

    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.srcObject = null;
        audioElementRef.current.remove();
      } catch (error) {
        console.log(
          "Audio cleanup error:",
          error
        );
      }

      audioElementRef.current = null;
      audioTrackSidRef.current = null;
    }
  };

  // -----------------------------------------------
  // END CALL
  // -----------------------------------------------

  const endCall = async () => {
    cleanupAudio();

    if (room) {
      try {
        await room.disconnect();
      } catch (error) {
        console.error(
          "Disconnect error:",
          error
        );
      }
    }

    setRoom(null);
    setStatus("Disconnected");
    setAgentResponse("");
    setOrderId("");

    addEvent("Call ended");
  };

  // -----------------------------------------------
  // START CALL
  // -----------------------------------------------

  const startCall = async () => {
    // Prevent multiple calls
    if (
      status === "Connecting..." ||
      status === "Live"
    ) {
      return;
    }

    try {
      setStatus("Connecting...");

      addEvent(
        "Requesting LiveKit token"
      );

      // -------------------------------------------
      // GET TOKEN
      // -------------------------------------------

const response = await fetch(
  "http://10.163.188.113:8000/api/token"
);
      if (!response.ok) {
        throw new Error(
          `Token server error: ${response.status}`
        );
      }

      const data = await response.json();

      console.log(
        "Backend response:",
        data
      );

      const token = data.token;
      const url = data.url;

      if (!token || !url) {
        throw new Error(
          "Token or LiveKit URL missing from backend"
        );
      }

      addEvent(
        "LiveKit token received"
      );

      // -------------------------------------------
      // CREATE ROOM
      // -------------------------------------------

      const newRoom = new Room();

      // -------------------------------------------
      // CONNECTED
      // -------------------------------------------

      newRoom.on(
        RoomEvent.Connected,
        () => {
          addEvent(
            "LiveKit connected"
          );
        }
      );

      // -------------------------------------------
      // DISCONNECTED
      // -------------------------------------------

      newRoom.on(
        RoomEvent.Disconnected,
        () => {
          cleanupAudio();

          setStatus("Disconnected");
          setRoom(null);

          addEvent(
            "LiveKit disconnected"
          );
        }
      );

      // -------------------------------------------
      // AGENT AUDIO
      // -------------------------------------------

      newRoom.on(
        RoomEvent.TrackSubscribed,
        (
          track,
          publication,
          participant
        ) => {
          // Only audio
          if (track.kind !== "audio") {
            return;
          }

          // Ignore own microphone
          if (
            participant.identity ===
            newRoom.localParticipant.identity
          ) {
            return;
          }

          console.log(
            "Agent audio track:",
            track.sid
          );

          console.log(
            "Agent participant:",
            participant.identity
          );

          // Remove previous audio
          cleanupAudio();

          // Attach new audio
          const element =
            track.attach();

          element.autoplay = true;
          element.playsInline = true;
          element.style.display = "none";

          document.body.appendChild(
            element
          );

          audioElementRef.current =
            element;

          audioTrackSidRef.current =
            track.sid;

          addEvent(
            "Agent audio received"
          );
        }
      );

      // -------------------------------------------
      // AUDIO UNSUBSCRIBED
      // -------------------------------------------

      newRoom.on(
        RoomEvent.TrackUnsubscribed,
        (track) => {
          if (track.kind !== "audio") {
            return;
          }

          console.log(
            "Agent audio unsubscribed:",
            track.sid
          );

          track.detach();

          if (
            audioTrackSidRef.current ===
            track.sid
          ) {
            cleanupAudio();
          }
        }
      );

      // -------------------------------------------
      // AGENT TRANSCRIPTION
      // -------------------------------------------

      newRoom.on(
        RoomEvent.TranscriptionReceived,
        (
          segments,
          participant
        ) => {
          // We only want remote/agent transcription
          if (
            !participant ||
            participant.identity ===
              newRoom.localParticipant.identity
          ) {
            return;
          }

          let text = "";

          segments.forEach(
            (segment) => {
              if (segment.text) {
                text += segment.text;
              }
            }
          );

          text = text.trim();

          if (!text) {
            return;
          }

          console.log(
            "Agent transcription:",
            text
          );

          // Show text on screen
          setAgentResponse(text);

          // Start speaking animation
          setIsSpeaking(true);

          addEvent(
            `Agent said: ${text}`
          );

          // Reset speaking animation timer
          if (speakingTimeoutRef.current) {
            clearTimeout(
              speakingTimeoutRef.current
            );
          }

          speakingTimeoutRef.current =
            setTimeout(() => {
              setIsSpeaking(false);

              speakingTimeoutRef.current =
                null;
            }, 1800);
        }
      );

      // -------------------------------------------
      // CONNECT TO LIVEKIT
      // -------------------------------------------

      await newRoom.connect(
        url,
        token
      );

      addEvent(
        "Connected to LiveKit"
      );

      // -------------------------------------------
      // ENABLE MICROPHONE
      // -------------------------------------------

      await newRoom.localParticipant.setMicrophoneEnabled(
        true
      );

      console.log(
        "Local microphone tracks:",
        newRoom.localParticipant
          .audioTrackPublications
      );

      addEvent(
        "Microphone enabled"
      );

      // -------------------------------------------
      // SAVE ROOM
      // -------------------------------------------

      setRoom(newRoom);
      setStatus("Live");

      addEvent(
        "Call is live"
      );
    } catch (error) {
      console.error(
        "Connection error:",
        error
      );

      cleanupAudio();

      setStatus("Disconnected");

      addEvent(
        `Connection failed: ${error.message}`
      );
    }
  };

  // -----------------------------------------------
  // UI
  // -----------------------------------------------

  return (
    <div className="app">

      {/* HEADER */}

      <h1>
        Customer Support Agent
      </h1>

      {/* STATUS */}

      <div
        className={`status ${
          status === "Live"
            ? "live"
            : ""
        }`}
      >
        <strong>
          Status:
        </strong>{" "}
        {status}
      </div>

      {/* BUTTONS */}

      {status !== "Live" &&
        status !== "Connecting..." && (
          <button
            onClick={startCall}
          >
            🎙️ Start Call
          </button>
        )}

      {status === "Live" && (
        <button
          onClick={endCall}
        >
          🔴 End Call
        </button>
      )}

      {/* ========================================= */}
      {/* AGENT SECTION */}
      {/* ========================================= */}

      <div className="agent-section">

        {/* ======================================= */}
        {/* ROBOT */}
        {/* ======================================= */}

        <div className="agent-photo-card">

          <div
            className={`robot-wrapper ${
              isSpeaking
                ? "speaking"
                : ""
            }`}
          >

            {/* Robot Image */}

            <img
              src="/robot.jpeg"
              alt="Customer Support Robot"
              className="robot-image"
            />

            {/* Animated Eyes */}

            <div className="robot-eye robot-eye-left"></div>

            <div className="robot-eye robot-eye-right"></div>

            {/* Animated Mouth */}

            <div className="robot-mouth"></div>

            {/* Voice Waves */}

            {isSpeaking && (
              <div className="voice-waves">

                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>

              </div>
            )}

            {/* Live Badge */}

            <div className="live-badge">

              <span className="online-dot"></span>

              {isSpeaking
                ? "Speaking"
                : status === "Live"
                ? "Listening"
                : "Ready"}

            </div>

          </div>

          <h3>
            Rime Support Agent
          </h3>

          <p className="agent-role">
            Customer Support
          </p>

        </div>

        {/* ======================================= */}
        {/* AGENT RESPONSE */}
        {/* ======================================= */}

        <div className="agent-conversation">

          <div className="agent-conversation-header">

            <span>💬</span>

            <h2>
              Agent Response
            </h2>

          </div>

          <div className="agent-message-bubble">

            <div className="agent-message-icon">
              🎧
            </div>

            <div className="agent-message-content">

              <strong>
                Agent
              </strong>

              <p>
                {agentResponse ||
                  "Hello! I'm ready to help you with your order."}
              </p>

            </div>

          </div>

          {/* Speaking Indicator */}

          {isSpeaking && (
            <div className="listening-indicator">

              <span></span>
              <span></span>
              <span></span>

              Agent is speaking...

            </div>
          )}

        </div>

      </div>

      {/* ========================================= */}
      {/* ACTIVE ORDER */}
      {/* ========================================= */}

      <div className="panel order-panel">

        <h2>
          Active Order
        </h2>

        <p>
          <strong>
            Order:
          </strong>{" "}
          {orderId ||
            "No order selected"}
        </p>

      </div>

      {/* ========================================= */}
      {/* EVENTS */}
      {/* ========================================= */}

      <div className="panel">

        <h2>
          Events
        </h2>

        {events.length === 0 ? (
          <p>
            No events yet
          </p>
        ) : (
          events.map(
            (event, index) => (
              <p key={index}>

                <strong>
                  {event.time}
                </strong>{" "}
                —{" "}
                {event.message}

              </p>
            )
          )
        )}

      </div>

    </div>
  );
}

export default App;