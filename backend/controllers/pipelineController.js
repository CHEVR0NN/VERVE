// controllers/pipelineController.js
// Reads and writes GHL Pipelines and Opportunities

const { validationResult } = require('express-validator');
const ghlService            = require('../models/ghlService');

// ── GET /api/pipelines ────────────────────────────────────────────────────────
// Returns all pipelines for this GHL location
const listPipelines = async (req, res, next) => {
  try {
    const pipelines = await ghlService.getPipelines();

    return res.status(200).json({
      success:   true,
      count:     pipelines.length,
      pipelines,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/pipelines/:pipelineId/opportunities ──────────────────────────────
// Returns opportunities in a pipeline (optional ?stageId=&status=&limit=&startAfter=)
const listOpportunities = async (req, res, next) => {
  try {
    const { pipelineId } = req.params;
    const { stageId, status, limit, startAfter } = req.query;

    const result = await ghlService.getOpportunities({
      pipelineId,
      stageId,
      status,
      limit:      limit      ? parseInt(limit, 10) : 20,
      startAfter,
    });

    return res.status(200).json({
      success:       true,
      count:         result.opportunities.length,
      opportunities: result.opportunities,
      meta:          result.meta,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/opportunities ───────────────────────────────────────────────────
// Creates a new opportunity (link a contact to a pipeline stage)
const createOpportunity = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { pipelineId, pipelineStageId, contactId, name, status, monetaryValue } = req.body;

    const opportunity = await ghlService.createOpportunity({
      pipelineId,
      pipelineStageId,
      contactId,
      name,
      status,
      monetaryValue,
    });

    return res.status(201).json({
      success:     true,
      message:     'Opportunity created.',
      opportunity,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/opportunities/:opportunityId/stage ─────────────────────────────
// Moves an opportunity to a different pipeline stage
const moveOpportunityStage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { opportunityId } = req.params;
    const { pipelineStageId, status } = req.body;

    const opportunity = await ghlService.updateOpportunityStage(opportunityId, {
      pipelineStageId,
      status,
    });

    return res.status(200).json({
      success:     true,
      message:     'Opportunity stage updated.',
      opportunity,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listPipelines,
  listOpportunities,
  createOpportunity,
  moveOpportunityStage,
};
