require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");

const app = express();
const port = process.env.PORT || 3001;

app.use(
  cors({
    origin: "*",
    credential: true,
  }),
);
app.use(express.json());

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Track if we should use OpenAI (set to false when quota exceeded)
let useOpenAI = true;
let quotaErrorCount = 0;

// Load all JSON data files
let jsonData = {};

async function loadJsonFiles() {
  try {
    const resourceDir = path.join(__dirname, "resources");
    console.log(`📂 Looking for JSON files in: ${resourceDir}`);

    // Check if data directory exists
    try {
      await fs.access(resourceDir);
    } catch {
      console.log(`⚠️ Data directory not found: ${resourceDir}`);
      console.log(`📂 Trying current directory instead...`);
      // Fallback to current directory
      return loadJsonFilesFromCurrentDir();
    }
    const files = [
      "emergencyAlerts.json",
      "floodFallBack.json",
      "floodReports.json",
      "greetings.json",
      "sensorStatus.json",
    ];

    let loadedCount = 0;

    for (const file of files) {
      const filePath = path.join(resourceDir, file);
      try {
        const content = await fs.readFile(filePath, "utf8");
        const fileName = file.replace(".json", "");
        jsonData[fileName] = JSON.parse(content);
        loadedCount++;
        console.log(`✅ Loaded: ${file}`);
      } catch (error) {
        if (error.code === "ENOENT") {
          console.log(`❌ File not found: ${file}`);
        } else if (error instanceof SyntaxError) {
          console.log(`❌ JSON syntax error in: ${file} - ${error.message}`);
        } else {
          console.log(`⚠️ Could not load ${file}: ${error.message}`);
        }
      }
    }

    console.log(`📁 Loaded ${loadedCount}/${files.length} JSON data files`);
    // If no files loaded from data directory, try current directory
    if (loadedCount === 0) {
      console.log(`📂 Trying to load from current directory...`);
      await loadJsonFilesFromCurrentDir();
    }
  } catch (error) {
    console.error("❌ Error loading JSON files:", error);
  }
}

// Intelligent fallback response generator using JSON data
function getFallbackResponse(message) {
  const msg = message.toLowerCase();

  // Try to find the most appropriate response from JSON data
  let response = "";

  // 1. Check for greetings
  if (
    msg.includes("hello") ||
    msg.includes("hi") ||
    msg.includes("good morning") ||
    msg.includes("good evening")
  ) {
    const hour = new Date().getHours();
    let timeKey = "morning";
    if (hour >= 12 && hour < 17) timeKey = "afternoon";
    else if (hour >= 17 && hour < 21) timeKey = "evening";
    else if (hour >= 21 || hour < 5) timeKey = "night";

    const greetings = jsonData.greetings?.timeBased?.[timeKey];
    if (greetings && greetings.length > 0) {
      return greetings[Math.floor(Math.random() * greetings.length)]
        .replace("{{riskLevel}}", "low")
        .replace("{{status}}", "operational")
        .replace("{{sensorStatus}}", "12/15 active");
    }
  }

  // 2. Check for water level queries
  if (
    (msg.includes("water") && msg.includes("level")) ||
    msg.includes("water level")
  ) {
    const reading =
      jsonData.floodFallBack?.sensor?.readings?.normal ||
      "Normal water level detected";
    const risk = jsonData.floodFallBack?.floodRisk?.levels?.low || {
      level: "Low Risk",
    };

    return `🌊 **Water Level Status**\n• Status: ${reading}\n• Risk Level: ${risk.level}\n• Units: centimeters\n• Action: Continue monitoring`;
  }

  // 3. Check for flood risk queries
  if (
    msg.includes("flood") &&
    (msg.includes("risk") || msg.includes("probability"))
  ) {
    const riskLevels = jsonData.floodFallBack?.floodRisk?.levels;
    if (riskLevels) {
      const moderate = riskLevels.moderate;
      return `⚠️ **Flood Risk Assessment**\n• Level: ${moderate.level}\n• Probability: ${moderate.probability}\n• Description: ${moderate.description}\n• Recommended Actions: ${moderate.actions.slice(0, 2).join(", ")}`;
    }
  }

  // 4. Check for sensor status queries
  if (
    msg.includes("sensor") ||
    msg.includes("status") ||
    msg.includes("network")
  ) {
    const sensorStatus =
      jsonData.floodFallBack?.sensor?.status?.online ||
      "Sensor active and transmitting data";
    const network =
      jsonData.sensorStatus?.network?.gateway?.online ||
      "Gateway communicating with all sensors";

    return `📡 **Sensor Network Status**\n• Overall: ${sensorStatus}\n• Network: ${network}\n• Active Sensors: 12/15\n• Battery Status: Optimal`;
  }

  // 5. Check for emergency or alert queries
  if (
    msg.includes("emergency") ||
    msg.includes("alert") ||
    msg.includes("urgent")
  ) {
    const emergency = jsonData.emergencyAlerts?.alertLevels?.warning || {
      level: "Warning",
      template: "WARNING: {{message}}",
    };
    const protocol = jsonData.emergencyAlerts?.responseProtocols?.level2 || {
      name: "Enhanced Monitoring",
      actions: ["Increase sensor frequency", "Send email alerts"],
    };

    return `🚨 **Emergency Status**\n• Alert Level: ${emergency.level}\n• Protocol: ${protocol.name}\n• Actions: ${protocol.actions.slice(0, 2).join(", ")}\n• Priority: Medium`;
  }

  // 6. Check for report or analysis queries
  if (
    msg.includes("report") ||
    msg.includes("analysis") ||
    msg.includes("analyze")
  ) {
    const reportType =
      jsonData.floodReports?.templates?.dailyReport?.title ||
      "Daily Flood Monitoring Report";
    const sections =
      jsonData.floodReports?.templates?.dailyReport?.sections?.slice(0, 3) ||
      [];

    let reportSummary = `📊 **Report Available**\n• Type: ${reportType}\n• Key Sections:\n`;
    sections.forEach((section) => {
      reportSummary += `  - ${section.name}\n`;
    });
    reportSummary += `• Status: Ready for generation\n• Format: PDF/Email`;

    return reportSummary;
  }

  // 7. Check for evacuation queries
  if (
    msg.includes("evacuation") ||
    msg.includes("evacuate") ||
    msg.includes("shelter")
  ) {
    const evacuation = jsonData.emergencyAlerts?.evacuationMessages || {};
    return `🚨 **Evacuation Information**\n• Status: ${evacuation.prepare || "PREPARE TO EVACUATE"}\n• Shelters: Available in designated areas\n• Routes: Follow marked evacuation signs\n• Contacts: Emergency services`;
  }

  // 8. Check for weather queries
  if (
    msg.includes("weather") ||
    msg.includes("rain") ||
    msg.includes("storm")
  ) {
    const weatherAlerts = jsonData.emergencyAlerts?.alertTypes?.weather || {};
    const alert = weatherAlerts.heavyRain || "Heavy rainfall warning";

    return `🌧️ **Weather Monitoring**\n• Alert: ${alert}\n• Status: Monitoring active\n• Risk: Moderate\n• Recommendation: Stay informed`;
  }

  // Default response with system information
  const health = jsonData.floodFallBack?.api?.health || {
    system: "HydroBot - Flood Detection Assistant",
    status: "operational",
  };
  const floodRisk = jsonData.floodFallBack?.floodRisk?.levels?.low || {
    level: "Low Risk",
  };

  return (
    `🌊 **HydroGuard AI - Flood Monitoring System**\n\n` +
    `• System: ${health.system}\n` +
    `• Status: ${health.status}\n` +
    `• Current Flood Risk: ${floodRisk.level}\n` +
    `• Sensors: 12/15 active\n\n` +
    `I can help you with:\n` +
    `- Water level monitoring\n` +
    `- Flood risk assessment\n` +
    `- Sensor network status\n` +
    `- Emergency protocols\n` +
    `- Weather alerts\n` +
    `- Evacuation information\n` +
    `- Report generation`
  );
}

// Enhanced analysis using JSON data
function getEnhancedFallbackAnalysis(metrics, sensors) {
  const activeSensors =
    sensors?.filter((s) => s.status === "active").length || 10;
  const totalSensors = sensors?.length || 12;

  // Get risk assessment data
  const riskLevels = jsonData.floodFallBack?.floodRisk?.levels;
  const currentRisk =
    activeSensors < totalSensors * 0.8 ? riskLevels?.moderate : riskLevels?.low;

  // Get sensor status messages
  const sensorMessages = jsonData.sensorStatus?.sensors?.waterLevel || {};

  let analysis = `📈 **WATER DATA ANALYSIS**\n\n`;

  if (currentRisk) {
    analysis += `**Risk Assessment:**\n`;
    analysis += `• Level: ${currentRisk.level}\n`;
    analysis += `• Probability: ${currentRisk.probability}\n`;
    analysis += `• Description: ${currentRisk.description}\n`;
    analysis += `• Icon: ${currentRisk.icon}\n\n`;
  }

  analysis += `**Sensor Network:**\n`;
  analysis += `• Active: ${activeSensors}/${totalSensors} sensors\n`;
  analysis += `• Status: ${activeSensors === totalSensors ? sensorMessages.operational : "Some issues detected"}\n`;
  analysis += `• Units: ${sensorMessages.units || "cm"}\n\n`;

  if (metrics && metrics.length > 0) {
    analysis += `**Metrics Summary:**\n`;
    analysis += `• Data Points: ${metrics.length}\n`;
    analysis += `• Last Reading: ${new Date().toLocaleTimeString()}\n`;
    analysis += `• Quality: ${activeSensors > totalSensors * 0.7 ? "Good" : "Fair"}\n\n`;
  }

  if (currentRisk && currentRisk.actions) {
    analysis += `**Recommended Actions:**\n`;
    currentRisk.actions.slice(0, 3).forEach((action, i) => {
      analysis += `${i + 1}. ${action}\n`;
    });
  }

  return analysis;
}

// Chat endpoint with enhanced fallback
app.post("/api/chat", async (req, res) => {
  try {
    const { message, context } = req.body;

    console.log("📡 Request:", message.substring(0, 50));

    // If OpenAI is disabled due to quota, use enhanced fallback immediately
    if (!useOpenAI) {
      console.log("⚡ Using enhanced JSON fallback (OpenAI quota exceeded)");
      const fallback = getFallbackResponse(message);
      return res.json({
        response: fallback,
        timestamp: new Date().toISOString(),
        source: "json-fallback",
        dataSource: "multiple JSON files",
      });
    }

    // Try OpenAI
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are HydroGuard AI, a water monitoring assistant. Use this system information:
            
            Alert Levels: ${JSON.stringify(jsonData.emergencyAlerts?.alertLevels)}
            Flood Risks: ${JSON.stringify(jsonData.floodFallBack?.floodRisk?.levels)}
            Sensor Status: ${JSON.stringify(jsonData.sensorStatus?.sensors)}
            
            Help users with water level data, flood predictions, and sensor information. 
            Keep responses concise and helpful, referencing system protocols when appropriate.`,
          },
          ...(context || []),
          { role: "user", content: message },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0].message.content;

      // Reset error count on success
      quotaErrorCount = 0;

      console.log("✅ OpenAI response successful");

      return res.json({
        response: aiResponse,
        timestamp: new Date().toISOString(),
        source: "openai",
      });
    } catch (openaiError) {
      // Check if it's a quota error
      if (
        openaiError.message.includes("429") ||
        openaiError.message.includes("quota") ||
        openaiError.message.includes("billing")
      ) {
        quotaErrorCount++;
        console.log(`❌ OpenAI quota error (count: ${quotaErrorCount})`);

        // After 3 quota errors, disable OpenAI for this session
        if (quotaErrorCount >= 3) {
          useOpenAI = false;
          console.log(
            "🔴 OpenAI disabled for this session due to quota issues",
          );
        }

        // Use enhanced fallback response
        const fallback = getFallbackResponse(message);
        return res.json({
          response: fallback,
          error: "OpenAI quota exceeded, using enhanced JSON fallback",
          timestamp: new Date().toISOString(),
          source: "json-fallback",
          dataSource: "multiple JSON files",
        });
      }

      // For other OpenAI errors, throw to outer catch
      throw openaiError;
    }
  } catch (error) {
    console.error("❌ General error:", error.message);

    // Ultimate fallback using JSON data
    const fallback = getFallbackResponse(req.body.message || "");

    res.json({
      response: fallback,
      error: error.message,
      timestamp: new Date().toISOString(),
      source: "json-fallback-error",
    });
  }
});

// Enhanced analysis endpoint with JSON data
app.post("/api/analyze-water-data", async (req, res) => {
  try {
    const { metrics, sensors } = req.body;

    console.log("📊 Analysis request");

    // Try OpenAI first if enabled
    if (useOpenAI) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are a water monitoring expert. Use this flood risk framework:
              
              Risk Levels: ${JSON.stringify(jsonData.floodFallBack?.floodRisk?.levels)}
              Response Protocols: ${JSON.stringify(jsonData.emergencyAlerts?.responseProtocols)}
              Report Templates: ${JSON.stringify(jsonData.floodReports?.templates?.dailyReport?.sections)}
              
              Analyze the provided sensor data and provide insights about water levels, 
              potential risks, and recommendations based on our protocols.`,
            },
            {
              role: "user",
              content: `Analyze this water monitoring data:
              Metrics: ${JSON.stringify(metrics || [])}
              Sensors: ${JSON.stringify(sensors || [])}
              
              Provide insights on:
              1. Current water conditions
              2. Potential flood risks
              3. Recommendations for monitoring
              4. Any alerts needed`,
            },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        });

        return res.json({
          analysis: completion.choices[0].message.content,
          timestamp: new Date().toISOString(),
          source: "openai",
        });
      } catch (openaiError) {
        console.log("⚠️ OpenAI analysis failed, using enhanced fallback");
      }
    }

    // Enhanced fallback analysis using JSON data
    const fallbackAnalysis = getEnhancedFallbackAnalysis(metrics, sensors);

    res.json({
      analysis: fallbackAnalysis,
      timestamp: new Date().toISOString(),
      source: "json-fallback",
      dataSource: "floodFallBack.json, sensorStatus.json, emergencyAlerts.json",
    });
  } catch (error) {
    console.error("❌ Analysis error:", error);

    // Emergency fallback
    const emergency = jsonData.emergencyAlerts?.alertLevels?.info || {
      level: "Information",
      template: "INFO: {{message}}",
    };
    res.json({
      analysis: `${emergency.template.replace("{{message}}", "Water systems operational. Continue monitoring as scheduled.")}`,
      timestamp: new Date().toISOString(),
      source: "emergency-fallback",
    });
  }
});

// New endpoint to get specific JSON data
app.get("/api/json-data/:file", (req, res) => {
  const file = req.params.file;
  const data = jsonData[file];

  if (data) {
    res.json({
      file: file,
      data: data,
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(404).json({
      error: `File ${file} not found or not loaded`,
      availableFiles: Object.keys(jsonData),
    });
  }
});

// Health endpoint with enhanced status
app.get("/api/health", (req, res) => {
  const systemHealth = jsonData.floodFallBack?.api?.health || {
    status: "operational",
  };

  res.json({
    status: "healthy",
    system_status: systemHealth.status,
    openai_configured: !!process.env.OPENAI_API_KEY,
    openai_enabled: useOpenAI,
    quota_errors: quotaErrorCount,
    json_data_loaded: Object.keys(jsonData).length,
    json_files: Object.keys(jsonData),
    mode: useOpenAI ? "openai-priority" : "json-fallback-only",
    timestamp: new Date().toISOString(),
    message: useOpenAI
      ? "OpenAI enabled (will fallback to JSON data if needed)"
      : "Using JSON data fallback responses",
  });
});

// Endpoint to manually toggle OpenAI
app.post("/api/toggle-openai", (req, res) => {
  useOpenAI = !useOpenAI;
  quotaErrorCount = 0;

  res.json({
    openai_enabled: useOpenAI,
    message: useOpenAI
      ? "OpenAI re-enabled"
      : "OpenAI disabled (using JSON fallback)",
    timestamp: new Date().toISOString(),
  });
});

// New endpoint to get greeting based on time
app.get("/api/greeting", (req, res) => {
  const hour = new Date().getHours();
  let timeKey = "morning";
  if (hour >= 12 && hour < 17) timeKey = "afternoon";
  else if (hour >= 17 && hour < 21) timeKey = "evening";
  else if (hour >= 21 || hour < 5) timeKey = "night";

  const greetings = jsonData.greetings?.timeBased?.[timeKey];
  const greeting = greetings
    ? greetings[Math.floor(Math.random() * greetings.length)]
    : "Hello!";

  res.json({
    greeting: greeting,
    timeOfDay: timeKey,
    hour: hour,
    timestamp: new Date().toISOString(),
  });
});

// New endpoint to get flood risk levels
app.get("/api/flood-risk-levels", (req, res) => {
  const riskLevels = jsonData.floodFallBack?.floodRisk?.levels;

  if (riskLevels) {
    res.json({
      levels: riskLevels,
      count: Object.keys(riskLevels).length,
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(404).json({ error: "Flood risk data not available" });
  }
});
app.listen(3001, "0.0.0.0", () => {
  console.log("Server is running on http://0.0.0.0:3001");
});
// Start server and load JSON files
async function startServer() {
  await loadJsonFiles();

  app.listen(port, () => {
    console.log(`\n🚀 HYDROGUARD BACKEND v3.0 (JSON-Enhanced)`);
    console.log(`📍 http://localhost:${port}`);
    console.log(
      `🔑 OpenAI: ${process.env.OPENAI_API_KEY ? "Configured" : "Not configured"}`,
    );
    console.log(`📁 JSON Data: ${Object.keys(jsonData).length} files loaded`);
    console.log(`⚡ Mode: Hybrid (OpenAI + JSON Fallback)`);
    console.log(`\n📡 Enhanced Endpoints:`);
    console.log(
      `   POST /api/chat                    - Chat with enhanced fallback`,
    );
    console.log(`   POST /api/analyze-water-data      - Analyze water data`);
    console.log(
      `   GET  /api/health                  - System health with JSON status`,
    );
    console.log(`   GET  /api/greeting                - Time-based greeting`);
    console.log(`   GET  /api/flood-risk-levels       - All flood risk levels`);
    console.log(
      `   GET  /api/json-data/:file         - Get specific JSON data`,
    );
    console.log(`   POST /api/toggle-openai           - Toggle OpenAI on/off`);
    console.log(`\n💡 Your OpenAI account needs credit.`);
    console.log(`   Add funds at: https://platform.openai.com/account/billing`);
    console.log(`   Meanwhile, JSON fallback responses will work.`);
  });
}

startServer();
