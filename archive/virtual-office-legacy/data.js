/* Virtual Company 3D — Mock Data (ຂັ້ນຕອນນີ້ບໍ່ມີ Backend/DB/API)
   ແກ້ໄຂພະນັກງານ/ແຜນກໄດ້ທີ່ໄຟລ໌ນີ້ໄຟລ໌ດຽວ. */
(function () {
  'use strict';

  // col/row = ຕຳແໜ່ງໃນ grid 3x3 ຂອງຫ້ອງການ (row 0 = ດ້ານຫຼັງ, row 2 = ດ້ານໜ້າ/ທາງເຂົ້າ)
  var departments = [
    { id: 'admin',          name: 'Admin Management',  short: 'Admin',          lao: 'ຫ້ອງ Admin Management',     style: 'ceo',        col: 0, row: 0, color: '#f4d8a8', accent: '#c58b2a', head: 'e01', icon: 'fa-user-shield' },
    { id: 'meeting',        name: 'Meeting Room',      short: 'Meeting',        lao: 'ຫ້ອງປະຊຸມ',                  style: 'meeting',    col: 1, row: 0, color: '#cfe3f7', accent: '#3b82f6', head: null,  icon: 'fa-people-group' },
    { id: 'budget',         name: 'Budget Management', short: 'Budget',         lao: 'ຫ້ອງຈັດການງົບ',              style: 'finance',    col: 2, row: 0, color: '#cdeedd', accent: '#16a34a', head: 'e10', icon: 'fa-wallet' },
    { id: 'asset_request',  name: 'Asset Request',     short: 'Asset Request',  lao: 'ຫ້ອງ Asset Request',         style: 'sales',      col: 0, row: 1, color: '#fbd5d5', accent: '#ef4444', head: 'e03', icon: 'fa-file-circle-plus' },
    { id: 'contract',       name: 'Contract',          short: 'Contract',       lao: 'ຫ້ອງໃບສັນຍາ',                style: 'hr',         col: 1, row: 1, color: '#ffe8c2', accent: '#f59e0b', head: 'e13', icon: 'fa-file-signature' },
    { id: 'announce',       name: 'Announcements',     short: 'Announce',       lao: 'ຫ້ອງປະກາດ ແລະ ແຈ້ງເຕືອນ',      style: 'marketing',  col: 2, row: 1, color: '#f6d3ef', accent: '#d946ef', head: 'e07', icon: 'fa-bullhorn' },
    { id: 'asset_tracking', name: 'Asset Tracking',    short: 'Asset Tracking', lao: 'ຫ້ອງ Asset Tracking',        style: 'it',         col: 0, row: 2, color: '#d5d9f8', accent: '#6366f1', head: 'e16', icon: 'fa-location-crosshairs' },
    { id: 'reception',      name: 'Reception',         short: 'Reception',      lao: 'ຕ້ອນຮັບ',                    style: 'reception',  col: 1, row: 2, color: '#d3f0ef', accent: '#14b8a6', head: null,  icon: 'fa-bell-concierge' },
    { id: 'delivery',       name: 'Delivery Report',   short: 'Delivery',       lao: 'ຫ້ອງລາຍງານການຈັດສົ່ງ',        style: 'operations', col: 2, row: 2, color: '#e2e8d0', accent: '#65a30d', head: 'e21', icon: 'fa-truck-ramp-box' }
  ];


  // activity: work (ນັ່ງເຮັດວຽກ) | meeting (ເຂົ້າປະຊຸມ) | walk (ຍ່າງ) | break (ພັກ) | leave (ລາ/ບໍ່ຢູ່ຫ້ອງການ)
  // desk = ລຳດັບໂຕະໃນແຜນກ (ສຳລັບ work) · route = ເສັ້ນທາງຍ່າງ (ສຳລັບ walk)
  var employees = [
    { id: 'e01', name: 'Khamphoui Sengdara',  role: 'Admin Manager',     dept: 'admin',        activity: 'work',    desk: 0, task: 'Reviewing user access and approval settings', load: 82, tone: 1, hair: 0 },
    { id: 'e02', name: 'Noy Phommachanh',     role: 'Admin Assistant',         dept: 'admin',        activity: 'work',    desk: 1, task: 'Creating DSM user accounts',          load: 64, tone: 0, hair: 1 },

    { id: 'e03', name: 'Somphone Keomany',    role: 'Asset Request Manager',               dept: 'asset_request',      activity: 'work',    desk: 0, task: 'Reviewing pending asset requests',   load: 78, tone: 1, hair: 2 },
    { id: 'e04', name: 'Vilay Souvannavong',  role: 'Senior Asset Request Officer',      dept: 'asset_request',      activity: 'work',    desk: 1, task: 'Checking outlet code in outlet masterdata',       load: 71, tone: 2, hair: 0 },
    { id: 'e05', name: 'Manivone Lasy',       role: 'Asset Request Officer',             dept: 'asset_request',      activity: 'meeting', desk: 2, task: 'Weekly asset request sync',                 load: 55, tone: 0, hair: 1 },
    { id: 'e06', name: 'Bounmy Inthavong',    role: 'Asset Request Coordinator',           dept: 'asset_request',      activity: 'work',    desk: 3, task: 'Updating outlet masterdata',              load: 48, tone: 1, hair: 2 },

    { id: 'e07', name: 'Dalavanh Chanthavong',role: 'Announcement Manager',           dept: 'announce',  activity: 'meeting', desk: 0, task: 'Notification campaign kickoff',          load: 80, tone: 0, hair: 1 },
    { id: 'e08', name: 'Sengphet Vongsa',     role: 'Graphic Designer',            dept: 'announce',  activity: 'work',    desk: 1, task: 'Designing announcement banners',    load: 74, tone: 2, hair: 0 },
    { id: 'e09', name: 'Ketsana Phimmasone',  role: 'Content Specialist',          dept: 'announce',  activity: 'work',    desk: 2, task: 'Writing announcement text',           load: 62, tone: 1, hair: 1 },

    { id: 'e10', name: 'Sisavath Boupha',     role: 'Budget Manager',             dept: 'budget',    activity: 'work',    desk: 0, task: 'Approving budget requests',        load: 88, tone: 1, hair: 2 },
    { id: 'e11', name: 'Phonsavanh Rattana',  role: 'Senior Budget Analyst',           dept: 'budget',    activity: 'work',    desk: 1, task: 'Reconciling monthly budget vs actual',      load: 76, tone: 0, hair: 1 },
    { id: 'e12', name: 'Anousone Vilaylack',  role: 'Budget Officer',    dept: 'budget',    activity: 'meeting', desk: 2, task: 'Budget review with management',     load: 59, tone: 2, hair: 0 },

    { id: 'e13', name: 'Khounmy Saysana',     role: 'Contract Manager',                  dept: 'contract',         activity: 'work',    desk: 0, task: 'Reviewing loan contracts awaiting signature',   load: 69, tone: 0, hair: 1 },
    { id: 'e14', name: 'Thidavanh Keopaseuth',role: 'Contract Officer',                  dept: 'contract',         activity: 'walk',    desk: 1, task: 'Delivering contracts for signature', load: 52, tone: 1, hair: 1, route: 'A' },

    { id: 'e15', name: 'Sengdao Mounivong',   role: 'Office Receptionist',         dept: 'reception',  activity: 'work',    desk: 0, task: 'Welcoming visitors',                load: 45, tone: 0, hair: 1 },
    { id: 'e29', name: 'Lattana Khamvongsa',  role: 'Front Desk Assistant',        dept: 'reception',  activity: 'break',   desk: 1, task: 'Coffee break',                      load: 20, tone: 1, hair: 2, spot: 0 },

    { id: 'e16', name: 'Outhai Sayavong',     role: 'Asset Tracking Manager',                  dept: 'asset_tracking',         activity: 'work',    desk: 0, task: 'Monitoring cooler locations',          load: 85, tone: 1, hair: 0 },
    { id: 'e17', name: 'Phetsamone Douangdy', role: 'Asset Tracking Analyst',        dept: 'asset_tracking',         activity: 'work',    desk: 1, task: 'Checking asset serial numbers',         load: 79, tone: 2, hair: 2 },
    { id: 'e18', name: 'Xaiyavong Thammavong',role: 'Software Developer',          dept: 'asset_tracking',         activity: 'work',    desk: 2, task: 'Building asset tracking dashboard',       load: 91, tone: 1, hair: 0 },
    { id: 'e19', name: 'Vanida Sihalath',     role: 'Field Support Specialist',       dept: 'asset_tracking',         activity: 'walk',    desk: 3, task: 'Helping staff with a scan issue', load: 58, tone: 0, hair: 1, route: 'B' },

    { id: 'e20', name: 'Chanthaphone Xayasane', role: 'Delivery Report Analyst',        dept: 'delivery', activity: 'work',    desk: 1, task: 'Analyzing delivery performance',    load: 73, tone: 2, hair: 1 },
    { id: 'e21', name: 'Bounthavy Oudomsouk', role: 'Delivery Report Manager',          dept: 'delivery', activity: 'meeting', desk: 0, task: 'Cross-room planning',         load: 83, tone: 1, hair: 0 },
    { id: 'e22', name: 'Soukanh Phanthavong', role: 'Logistics Coordinator',       dept: 'delivery', activity: 'walk',    desk: 2, task: 'Checking warehouse schedule',       load: 66, tone: 2, hair: 2, route: 'C' },

    { id: 'e23', name: 'Viengsay Luangkhot',  role: 'Delivery Officer',         dept: 'delivery', activity: 'break',   desk: 3, task: 'Coffee break',                      load: 25, tone: 0, hair: 1, spot: 1 },
    { id: 'e24', name: 'Phouvong Insisiengmay',role: 'Outlet Onboarding Lead',  dept: 'asset_request',      activity: 'meeting', desk: 4, task: 'Weekly asset request sync',                 load: 77, tone: 1, hair: 0 },
    { id: 'e25', name: 'Malivan Chounlamany', role: 'Notification Specialist',dept: 'announce',  activity: 'walk',    desk: 3, task: 'Delivering notices to each room',          load: 61, tone: 0, hair: 1, route: 'D' },

    { id: 'e26', name: 'Kongkeo Sithixay',    role: 'Contract Clerk',          dept: 'contract',         activity: 'leave',   desk: 2, task: 'On annual leave',                   load: 0,  tone: 1, hair: 2 },
    { id: 'e27', name: 'Nalinh Vannasouk',    role: 'Junior Budget Analyst',           dept: 'budget',    activity: 'leave',   desk: 3, task: 'Working remotely',                  load: 0,  tone: 0, hair: 1 },
    { id: 'e28', name: 'Saysamone Phoutthavong', role: 'QA Engineer',              dept: 'asset_tracking',         activity: 'meeting', desk: 4, task: 'Sprint planning',                   load: 70, tone: 1, hair: 0 }
  ];

  var STATUS = {
    work:    { label: 'Working',    lao: 'ກຳລັງເຮັດວຽກ', color: '#16a34a', active: true  },
    meeting: { label: 'In Meeting', lao: 'ກຳລັງປະຊຸມ',   color: '#2563eb', active: true  },
    walk:    { label: 'Walking',    lao: 'ກຳລັງເດີນ',     color: '#f59e0b', active: true  },
    break:   { label: 'On Break',   lao: 'ພັກ',           color: '#8b5cf6', active: false },
    leave:   { label: 'Away',       lao: 'ບໍ່ຢູ່ຫ້ອງການ', color: '#94a3b8', active: false }
  };

  window.VO_DATA = { departments: departments, employees: employees, STATUS: STATUS, company: 'Lao Beverage Co. (Mock)' };
})();
