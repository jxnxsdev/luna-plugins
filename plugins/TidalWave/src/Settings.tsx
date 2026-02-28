import { useEffect, useState } from "react"
import React from "react"
import { ReactiveStore } from "@luna/core"
import { generateQrCodeDataUrl } from "@jxnxsdev/utils"
import { getShareUrl } from "./native/webserver.native"

type Settings = {
  webPort: number
  serverAccessScope: "local" | "network"
  usePassword: boolean
  password: string
}

// Load plugin settings
export const settings = await ReactiveStore.getPluginStorage<Settings>("TidalWave", {
  webPort: 80,
  serverAccessScope: "network",
  usePassword: false,
  password: "",
})

export const Settings = () => {
  const [webPort, setWebPort] = useState(settings.webPort)
  const [serverAccessScope, setServerAccessScope] = useState(settings.serverAccessScope)
  const [usePassword, setUsePassword] = useState(settings.usePassword)
  const [password, setPassword] = useState(settings.password)
  const [qrCode, setQrCode] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const shareUrl = await getShareUrl(
        serverAccessScope,
      )
      const code = await generateQrCodeDataUrl(shareUrl, {
        errorCorrectionLevel: "H",
      })
      if (typeof code === "string") {
        setQrCode(code.startsWith("data:image") ? code : `data:image/png;base64,${code}`)
      } else {
        setQrCode(null)
      }
    })()
  }, [webPort, serverAccessScope])

  // Update settings when values change
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    settings[key] = value
  }

  return (
    <div
      style={{
        background: "#1a1a2e",
        borderRadius: "16px",
        padding: "32px",
        boxShadow: "0 8px 32px rgba(255, 105, 180, 0.15)",
        maxWidth: "480px",
        margin: "40px auto",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#fff",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #ff69b4, #da70d6)",
        }}
      />

      <h2
        style={{
          fontSize: "1.75rem",
          marginBottom: "16px",
          textAlign: "center",
          color: "#ff69b4",
          fontWeight: "600",
        }}
      >
        TidalWave
      </h2>

      <p
        style={{
          fontSize: "0.95rem",
          lineHeight: "1.6",
          marginBottom: "24px",
          textAlign: "center",
          color: "rgba(255, 255, 255, 0.8)",
        }}
      >
        TidalWave lets you share the Tidal player with multiple people — no more fighting over the aux cable. Everyone
        must be on the same WiFi as this computer. Scan the QR code below.
      </p>

      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "24px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {qrCode ? (
          <img
            src={qrCode}
            alt="QR Code"
            style={{
              width: "100%",
              maxWidth: "250px",
              height: "auto",
            }}
          />
        ) : (
          <p style={{ textAlign: "center", color: "#555" }}>Generating QR code…</p>
        )}
      </div>

      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>Endpoint Access Scope (restart required)</label>
        <select
          value={serverAccessScope}
          onChange={(event) => {
            const value = event.target.value as "local" | "network"
            setServerAccessScope(value)
            updateSetting("serverAccessScope", value)
          }}
          style={inputStyle}
        >
          <option value="local">Local PC only</option>
          <option value="network">Whole network</option>
        </select>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>Web Port (Please restart Tidal for changes to take affect)</label>
        <input
          type="number"
          value={webPort}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10)
            setWebPort(value)
            updateSetting("webPort", value)
          }}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={usePassword}
            onChange={(e) => {
              const value = e.target.checked
              setUsePassword(value)
              updateSetting("usePassword", value)
            }}
            style={{ marginRight: "8px" }}
          />
          Require Password
        </label>
      </div>

      {usePassword && (
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              const value = e.target.value
              setPassword(value)
              updateSetting("password", value)
            }}
            style={inputStyle}
          />
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  display: "block",
  fontSize: "0.9rem",
  marginBottom: "8px",
  color: "rgba(255, 255, 255, 0.7)",
}

const inputStyle = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: "8px",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  color: "#fff",
  fontSize: "1rem",
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
  boxSizing: "border-box" as const,
}
