# Redsail RS720C Web Controller

A lightweight, web-based interface for controlling the **Redsail RS720C** cutting plotter. This application allows you to manage vector cuts (HPGL/PLT) via a local web browser, streaming data directly to your hardware over Serial/USB.

---

## ⚠️ Disclaimer
**Use at your own risk.** This software interacts directly with physical hardware. 
- Improper configurations or malformed plot files can cause unexpected hardware behavior.
- Always ensure you have physical access to the plotter's **Emergency Stop** or power switch during operation.
- The developers are not responsible for any damage to hardware, materials, or personnel.

---

## 🚀 Overview


This tool bridges the gap between modern web workflows and legacy serial hardware. Instead of using proprietary sign-cutting software, you can host this on your local machine and send jobs from any device on your network.

### Key Features
* **Browser-Based UI:** Upload and manage `.plt` and `.hpgl` files.
* **Serial Streaming:** Handles data buffering to prevent plotter overflow.
* **Localhost API:** Can be triggered via external scripts or internal network requests.

---

## 🛠 Setup & Configuration

### 1. Hardware Connection
Ensure your Redsail RS720C is connected via the USB-to-Serial adapter or the native DB9 port. 

### 2. Network Configuration
By default, the application binds to your local environment. Based on your system configuration, access the dashboard at:
* **Local:** `http://localhost:3000`
* **Network IP:** `http://192.168.1.XXX:3000` *(Use your assigned static IP for consistent access)*

### 3. Serial Settings
Most Redsail RS720C units use the following default settings. Update your `.env` or `config.json` accordingly:

| Parameter | Value |
| :--- | :--- |
| **Baud Rate** | 9600 (or 38400) |
| **Data Bits** | 8 |
| **Parity** | None |
| **Stop Bits** | 1 |
| **Flow Control** | Hardware (RTS/CTS) |

---

## 📥 Installation

1. **Clone the repository:**
```bash
   git clone [https://github.com/your-username/redsail-rs720c-web.git](https://github.com/your-username/redsail-rs720c-web.git)
   cd redsail-rs720c-web
```

2. **Install Dependencies:**

```bash
# If using Node.js
npm install

```


3. **Start the Controller:**
```bash
npm start

```



---

## 📂 Usage

1. Open the web interface.
2. Select your Serial Port (e.g., `COM3` on Windows or `/dev/ttyUSB0` on Linux).
3. Upload your **HPGL/PLT** file.
4. Set the plotter origin manually on the machine.
5. Click **"Send to Plotter"**.

---

## 📜 License

This project is provided "as-is" for personal and educational use. 

