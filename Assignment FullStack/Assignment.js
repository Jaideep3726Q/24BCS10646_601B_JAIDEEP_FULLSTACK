
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const events = [
  "CODING_HACKATHON",
  "AI_WORKSHOP",
  "ROBOTICS",
  "GAMING"
];

const Registration = mongoose.model("Registration", {
  studentName: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  collegeEmail: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(edu|ac\.in)$/
  },
  rollNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z0-9]{8,10}$/
  },
  eventType: {
    type: String,
    required: true,
    enum: events
  },
  teamSize: {
    type: Number,
    required: true,
    min: 1,
    max: 4,
    validate: {
      validator: Number.isInteger,
      message: "Team size must be a whole number"
    }
  },
  ticketPrice: {
    type: Number,
    required: true,
    min: 0
  },
  discountCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: ""
  },
  finalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ["PENDING", "CONFIRMED", "CANCELLED"],
    default: "PENDING"
  },
  registrationDate: {
    type: Date,
    default: Date.now
  }
});

// Work out the amount the student has to pay.
function getAmount(price, code) {
  if (code === "CAMPUS50") return price * 0.5;
  if (code === "EARLYBIRD") return Math.max(0, price - 100);
  if (code) throw new Error("Invalid discount code");

  return price;
}

function checkRegistration(event, team, price) {
  if (!events.includes(event)) {
    throw new Error("Please select a valid event");
  }

  if (!Number.isInteger(team) || team < 1 || team > 4) {
    throw new Error("Team size must be between 1 and 4");
  }

  if (event === "AI_WORKSHOP" && team !== 1) {
    throw new Error("AI Workshop is for individual registrations only");
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Ticket price cannot be negative");
  }
}

function sendError(res, err) {
  if (err.code === 11000) {
    return res.status(409).json({
      error: "This email is already registered"
    });
  }

  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: "Something went wrong" });
}

app.get("/api", (req, res) => {
  res.json({ msg: "Hello World!" });
});

// Add a new registration.
app.post("/api/registrations", async (req, res) => {
  try {
    const {
      studentName,
      collegeEmail,
      rollNumber,
      eventType,
      teamSize,
      ticketPrice
    } = req.body;

    if (
      !studentName ||
      !collegeEmail ||
      !rollNumber ||
      !eventType ||
      teamSize === undefined ||
      ticketPrice === undefined
    ) {
      return res.status(400).json({
        error: "Please provide all required fields"
      });
    }

    const event = String(eventType).trim();
    const team = Number(teamSize);
    const price = Number(ticketPrice);
    const code = String(req.body.discountCode || "")
      .trim()
      .toUpperCase();

    checkRegistration(event, team, price);
    const amount = getAmount(price, code);

    const registration = await Registration.create({
      studentName,
      collegeEmail,
      rollNumber,
      eventType: event,
      teamSize: team,
      ticketPrice: price,
      discountCode: code,
      finalAmount: amount
    });

    res.status(201).json(registration);
  } catch (err) {
    sendError(res, err);
  }
});

// View registrations and filter by event or status.
app.get("/api/registrations", async (req, res) => {
  try {
    const filter = {};

    if (req.query.eventType) {
      filter.eventType = req.query.eventType;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const list = await Registration.find(filter);
    res.json(list);
  } catch (err) {
    sendError(res, err);
  }
});

// Find one registration.
app.get("/api/registrations/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid registration ID" });
    }

    const item = await Registration.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ error: "Registration not found" });
    }

    res.json(item);
  } catch (err) {
    sendError(res, err);
  }
});

// Edit registration details.
app.put("/api/registrations/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid registration ID" });
    }

    const old = await Registration.findById(req.params.id);

    if (!old) {
      return res.status(404).json({ error: "Registration not found" });
    }

    const fields = [
      "studentName",
      "collegeEmail",
      "rollNumber",
      "eventType",
      "teamSize",
      "ticketPrice",
      "discountCode",
      "status"
    ];

    const changes = {};

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        changes[field] = req.body[field];
      }
    }

    const event = changes.eventType ?? old.eventType;
    const team = changes.teamSize === undefined
      ? old.teamSize
      : Number(changes.teamSize);
    const price = changes.ticketPrice === undefined
      ? old.ticketPrice
      : Number(changes.ticketPrice);
    const code = changes.discountCode === undefined
      ? old.discountCode
      : String(changes.discountCode).trim().toUpperCase();

    checkRegistration(event, team, price);

    changes.teamSize = team;
    changes.ticketPrice = price;
    changes.discountCode = code;
    changes.finalAmount = getAmount(price, code);

    const updated = await Registration.findByIdAndUpdate(
      req.params.id,
      changes,
      { new: true, runValidators: true }
    );

    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// Remove a registration.
app.delete("/api/registrations/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid registration ID" });
    }

    const removed = await Registration.findByIdAndDelete(req.params.id);

    if (!removed) {
      return res.status(404).json({ error: "Registration not found" });
    }

    res.json({ msg: "Registration deleted successfully" });
  } catch (err) {
    sendError(res, err);
  }
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err.message);
  });
