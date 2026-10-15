import { AdmissionPack } from '../models/AdmissionPack.js';
import { AdmissionApplication } from '../models/AdmissionApplication.js';
import { StudentRequirement } from '../models/StudentRequirement.js';
import { AdmissionEvent } from '../models/AdmissionEvent.js';
import { Student } from '../models/Student.js';
import asyncHandler from '../utils/asyncHandler.js';

const toMap = (rows) =>
  rows.reduce((acc, row) => {
    acc[row._id || 'unset'] = row.count;
    return acc;
  }, {});

// School onboarding dashboard: admissions health at a glance.
export const getOnboarding = asyncHandler(async (req, res) => {
  const owner = req.user._id;

  const [packsByStatus, appsByStatus, students, requirementTotals, recentApplications, recentEvents] =
    await Promise.all([
      AdmissionPack.aggregate([{ $match: { owner } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      AdmissionApplication.aggregate([
        { $match: { owner } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Student.countDocuments({ owner }),
      StudentRequirement.aggregate([
        { $match: { owner } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            verified: { $sum: { $cond: ['$schoolVerified', 1, 0] } },
            preparing: { $sum: { $cond: [{ $eq: ['$parentStatus', 'preparing'] }, 1, 0] } },
            ready: { $sum: { $cond: [{ $in: ['$parentStatus', ['ready', 'submitted']] }, 1, 0] } },
            needsVerification: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$requiresVerification', true] }, { $eq: ['$schoolVerified', false] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      AdmissionApplication.find({ owner }).sort({ createdAt: -1 }).limit(8),
      AdmissionEvent.find({ owner }).sort({ createdAt: -1 }).limit(12),
    ]);

  const apps = toMap(appsByStatus);
  const packs = toMap(packsByStatus);
  const reqs = requirementTotals[0] || {
    total: 0,
    verified: 0,
    preparing: 0,
    ready: 0,
    needsVerification: 0,
  };
  const decided = (apps.accepted || 0) + (apps.rejected || 0) + (apps.enrolled || 0);
  const totalApps = Object.values(apps).reduce((a, b) => a + b, 0);

  res.json({
    success: true,
    data: {
      packs: { draft: packs.draft || 0, published: packs.published || 0, archived: packs.archived || 0 },
      applications: {
        total: totalApps,
        draft: apps.draft || 0,
        submitted: apps.submitted || 0,
        underReview: apps.under_review || 0,
        incomplete: apps.incomplete || 0,
        accepted: apps.accepted || 0,
        rejected: apps.rejected || 0,
        enrolled: apps.enrolled || 0,
        awaitingDecision: (apps.submitted || 0) + (apps.under_review || 0),
        decided,
      },
      students,
      requirements: {
        total: reqs.total,
        verified: reqs.verified,
        preparing: reqs.preparing,
        ready: reqs.ready,
        needsVerification: reqs.needsVerification,
        completion:
          reqs.total === 0 ? 100 : Math.round(((reqs.verified + reqs.ready) / reqs.total) * 100),
      },
      recentApplications: recentApplications.map((a) => a.toClient()),
      recentEvents: recentEvents.map((e) => e.toClient()),
    },
  });
});

export default { getOnboarding };
