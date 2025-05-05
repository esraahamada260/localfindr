// models/Place.js
const mongoose = require('mongoose');

const placeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['cafe', 'restaurant', 'pharmacy', 'other'],
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  placeId: {
    type: String,
    unique: true, // Ensure unique Google Place ID
    required: false,
  },
});

// Create 2dsphere index for geospatial queries
placeSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Place', placeSchema);