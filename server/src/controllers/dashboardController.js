import { School, TRADE_KEYS } from '../models/School.js';
import { Holding } from '../models/Holding.js';
import asyncHandler from '../utils/asyncHandler.js';

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);

export const getDashboard = asyncHandler(async (req, res) => {
  const activeMatch = { owner: req.user._id, status: 'active' };

  const [totalsAgg] = await School.aggregate([
    { $match: activeMatch },
    {
      $group: {
        _id: null,
        totalSchools: { $sum: 1 },
        totalStudents: { $sum: '$totalStudents' },
        sod: { $sum: { $cond: [{ $isNumber: '$trades.sod' }, '$trades.sod', 0] } },
        nit: { $sum: { $cond: [{ $isNumber: '$trades.nit' }, '$trades.nit', 0] } },
        csa: { $sum: { $cond: [{ $isNumber: '$trades.csa' }, '$trades.csa', 0] } },
        acc: { $sum: { $cond: [{ $isNumber: '$trades.acc' }, '$trades.acc', 0] } },
        other: { $sum: { $cond: [{ $isNumber: '$trades.other' }, '$trades.other', 0] } },
        laptops: { $sum: { $cond: [{ $isNumber: '$laptops' }, '$laptops', 0] } },
        teachers: { $sum: { $cond: [{ $isNumber: '$teachers' }, '$teachers', 0] } },
        incomplete: { $sum: { $cond: ['$isIncomplete', 1, 0] } },
      },
    },
  ]);

  const [holdingCount, archivedCount] = await Promise.all([
    Holding.countDocuments({ owner: req.user._id }),
    School.countDocuments({ owner: req.user._id, status: 'archived' }),
  ]);

  const byTrades = {};
  for (const key of TRADE_KEYS) byTrades[key] = num(totalsAgg?.[key]);

  const [recent, byHolding, byDistrict, incompleteList] = await Promise.all([
    School.find(activeMatch).sort({ createdAt: -1 }).limit(8),
    School.aggregate([
      { $match: activeMatch },
      {
        $group: {
          _id: { holding: '$holding', name: '$holdingName' },
          schools: { $sum: 1 },
          students: { $sum: '$totalStudents' },
          laptops: { $sum: { $cond: [{ $isNumber: '$laptops' }, '$laptops', 0] } },
          teachers: { $sum: { $cond: [{ $isNumber: '$teachers' }, '$teachers', 0] } },
        },
      },
      { $sort: { schools: -1 } },
    ]),
    School.aggregate([
      { $match: activeMatch },
      {
        $group: {
          _id: '$district',
          schools: { $sum: 1 },
          students: { $sum: '$totalStudents' },
          laptops: { $sum: { $cond: [{ $isNumber: '$laptops' }, '$laptops', 0] } },
          teachers: { $sum: { $cond: [{ $isNumber: '$teachers' }, '$teachers', 0] } },
        },
      },
      { $sort: { schools: -1 } },
    ]),
    School.find({ ...activeMatch, isIncomplete: true })
      .sort({ updatedAt: -1 })
      .limit(20),
  ]);

  res.json({
    success: true,
    data: {
      totals: {
        holdings: holdingCount,
        schools: num(totalsAgg?.totalSchools),
        archivedSchools: archivedCount,
        students: num(totalsAgg?.totalStudents),
        laptops: num(totalsAgg?.laptops),
        teachers: num(totalsAgg?.teachers),
        incomplete: num(totalsAgg?.incomplete),
        trades: byTrades,
      },
      byHolding: byHolding.map((h) => ({
        id: h._id.holding?.toString?.() || null,
        name: h._id.name,
        schools: h.schools,
        students: num(h.students),
        laptops: num(h.laptops),
        teachers: num(h.teachers),
      })),
      byDistrict: byDistrict.map((d) => ({
        district: d._id || 'Unspecified',
        schools: d.schools,
        students: num(d.students),
        laptops: num(d.laptops),
        teachers: num(d.teachers),
      })),
      recent: recent.map((s) => s.toClient()),
      incompleteSchools: incompleteList.map((s) => s.toClient()),
    },
  });
});

export default { getDashboard };
