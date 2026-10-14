import mongoose from 'mongoose';
import { School, TRADE_KEYS } from '../models/School.js';
import { Holding } from '../models/Holding.js';
import { AuditLog } from '../models/AuditLog.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveHolding(holdingInput, user) {
  const value = String(holdingInput || '').trim();
  if (!value) throw ApiError.badRequest('Holding / project is required');

  // Accept either an ObjectId or a free-text holding name, scoped to the owner
  // so accounts can never reference each other's holdings.
  if (mongoose.isValidObjectId(value)) {
    const byId = await Holding.findOne({ _id: value, owner: user._id });
    if (byId) return byId;
  }

  const nameKey = value.toLowerCase().replace(/\s+/g, ' ');
  let holding = await Holding.findOne({ owner: user._id, nameKey });
  if (!holding) {
    holding = await Holding.create({
      owner: user._id,
      name: value,
      nameKey,
      createdBy: user?._id || null,
    });
  }
  return holding;
}

async function findDuplicates({ ownerId, holdingId, schoolNameKey, excludeId }) {
  const query = { owner: ownerId, holding: holdingId, schoolNameKey };
  if (excludeId) query._id = { $ne: excludeId };
  return School.find(query);
}

export const createSchool = asyncHandler(async (req, res) => {
  const body = req.body;
  const holding = await resolveHolding(body.holding, req.user);

  // Idempotent offline sync: if this clientId was already saved by this
  // account, return the existing record.
  if (body.clientId) {
    const existingSync = await School.findOne({ owner: req.user._id, clientId: body.clientId });
    if (existingSync) {
      return res.status(200).json({
        success: true,
        data: { school: existingSync.toClient(), idempotent: true },
      });
    }
  }

  const schoolNameKey = body.schoolName.trim().toLowerCase().replace(/\s+/g, ' ');
  const duplicates = await findDuplicates({
    ownerId: req.user._id,
    holdingId: holding._id,
    schoolNameKey,
  });

  if (duplicates.length > 0 && !body.confirmDuplicate) {
    throw ApiError.conflict(
      'A school with this name already exists under this holding/project',
      {
        duplicates: duplicates.map((d) => ({
          id: d._id,
          schoolName: d.schoolName,
          district: d.district,
          status: d.status,
        })),
      }
    );
  }

  const school = new School({
    owner: req.user._id,
    holding: holding._id,
    holdingName: holding.name,
    schoolName: body.schoolName.trim(),
    district: body.district.trim(),
    dateOfCollection: body.dateOfCollection,
    trades: {
      sod: body.trades.sod,
      nit: body.trades.nit,
      csa: body.trades.csa,
      acc: body.trades.acc,
      other: body.trades.other,
    },
    laptops: body.laptops,
    teachers: body.teachers,
    feedback: body.feedback || '',
    clientId: body.clientId || undefined,
    recordedBy: req.user._id,
    recordedByName: req.user.name,
  });

  await school.save();

  await AuditLog.create({
    entity: 'School',
    entityId: school._id,
    action: 'create',
    actor: req.user._id,
    actorName: req.user.name,
    snapshot: school.toClient(),
  });

  res.status(201).json({ success: true, data: { school: school.toClient() } });
});

export const listSchools = asyncHandler(async (req, res) => {
  const {
    search,
    holding,
    district,
    status = 'active',
    incomplete,
    from,
    to,
    page = 1,
    limit = 25,
    sort = '-dateOfCollection',
  } = req.query;

  const query = { owner: req.user._id };
  if (status && status !== 'all') query.status = status;

  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    query.$or = [{ schoolName: rx }, { district: rx }, { holdingName: rx }];
  }
  if (holding) query.holding = holding;
  if (district) query.district = district;
  if (incomplete === 'true') query.isIncomplete = true;

  if (from || to) {
    query.dateOfCollection = {};
    if (from) query.dateOfCollection.$gte = new Date(from);
    if (to) query.dateOfCollection.$lte = new Date(to);
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));

  const [items, total] = await Promise.all([
    School.find(query)
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    School.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      schools: items.map((s) => s.toClient()),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
  });
});

async function findOwnedSchool(req) {
  const school = await School.findOne({ _id: req.params.id, owner: req.user._id });
  if (!school) throw ApiError.notFound('School record not found');
  return school;
}

export const getSchool = asyncHandler(async (req, res) => {
  const school = await findOwnedSchool(req);
  res.json({ success: true, data: { school: school.toClient() } });
});

export const getSchoolHistory = asyncHandler(async (req, res) => {
  await findOwnedSchool(req);
  const logs = await AuditLog.find({ entity: 'School', entityId: req.params.id })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({
    success: true,
    data: {
      history: logs.map((l) => ({
        id: l._id,
        action: l.action,
        actorName: l.actorName,
        changes: l.changes,
        createdAt: l.createdAt,
      })),
    },
  });
});

export const updateSchool = asyncHandler(async (req, res) => {
  const school = await findOwnedSchool(req);
  const body = req.body;

  if (body.holding !== undefined) {
    const holding = await resolveHolding(body.holding, req.user);
    school.holding = holding._id;
    school.holdingName = holding.name;
  }

  if (body.schoolName !== undefined) {
    const schoolNameKey = body.schoolName.trim().toLowerCase().replace(/\s+/g, ' ');
    const duplicates = await findDuplicates({
      ownerId: req.user._id,
      holdingId: school.holding,
      schoolNameKey,
      excludeId: school._id,
    });
    if (duplicates.length > 0 && !body.confirmDuplicate) {
      throw ApiError.conflict(
        'Another school with this name already exists under this holding/project',
        { duplicates: duplicates.map((d) => d) }
      );
    }
    school.schoolName = body.schoolName.trim();
  }

  if (body.district !== undefined) school.district = body.district.trim();
  if (body.dateOfCollection !== undefined) school.dateOfCollection = body.dateOfCollection;
  if (body.feedback !== undefined) school.feedback = body.feedback;

  if (body.trades !== undefined) {
    for (const key of TRADE_KEYS) {
      if (body.trades[key] !== undefined) school.trades[key] = body.trades[key];
    }
  }
  if (body.laptops !== undefined) school.laptops = body.laptops;
  if (body.teachers !== undefined) school.teachers = body.teachers;

  school.updatedBy = req.user._id;

  await school.save();

  await AuditLog.create({
    entity: 'School',
    entityId: school._id,
    action: 'update',
    actor: req.user._id,
    actorName: req.user.name,
    changes: body,
    snapshot: school.toClient(),
  });

  res.json({ success: true, data: { school: school.toClient() } });
});

export const archiveSchool = asyncHandler(async (req, res) => {
  const school = await findOwnedSchool(req);
  if (school.status === 'archived') {
    throw ApiError.badRequest('School record is already archived');
  }

  school.status = 'archived';
  school.archivedAt = new Date();
  school.archivedBy = req.user._id;
  await school.save();

  await AuditLog.create({
    entity: 'School',
    entityId: school._id,
    action: 'archive',
    actor: req.user._id,
    actorName: req.user.name,
    snapshot: school.toClient(),
  });

  res.json({ success: true, data: { school: school.toClient() } });
});

export const restoreSchool = asyncHandler(async (req, res) => {
  const school = await findOwnedSchool(req);
  if (school.status === 'active') {
    throw ApiError.badRequest('School record is already active');
  }

  school.status = 'active';
  school.archivedAt = null;
  school.archivedBy = null;
  await school.save();

  await AuditLog.create({
    entity: 'School',
    entityId: school._id,
    action: 'restore',
    actor: req.user._id,
    actorName: req.user.name,
    snapshot: school.toClient(),
  });

  res.json({ success: true, data: { school: school.toClient() } });
});

// Suggests possible duplicate matches while typing a new school name.
export const checkDuplicate = asyncHandler(async (req, res) => {
  const { schoolName, holding, excludeId } = req.query;
  if (!schoolName || !holding) {
    throw ApiError.badRequest('schoolName and holding are required');
  }
  const holdingDoc = mongoose.isValidObjectId(holding)
    ? await Holding.findOne({ _id: holding, owner: req.user._id })
    : await Holding.findOne({
        owner: req.user._id,
        nameKey: String(holding).trim().toLowerCase(),
      });

  if (!holdingDoc) {
    return res.json({ success: true, data: { duplicates: [] } });
  }

  const schoolNameKey = String(schoolName).trim().toLowerCase().replace(/\s+/g, ' ');
  const duplicates = await findDuplicates({
    ownerId: req.user._id,
    holdingId: holdingDoc._id,
    schoolNameKey,
    excludeId,
  });

  res.json({
    success: true,
    data: { duplicates: duplicates.map((d) => d.toClient()) },
  });
});

export default {
  createSchool,
  listSchools,
  getSchool,
  updateSchool,
  archiveSchool,
  restoreSchool,
  getSchoolHistory,
  checkDuplicate,
};
