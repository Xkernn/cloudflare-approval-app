/* Virtual Company 3D — Mock Data (ຂັ້ນຕອນນີ້ບໍ່ມີ Backend/DB/API)
   ແກ້ໄຂພະນັກງານ/ແຜນກໄດ້ທີ່ໄຟລ໌ນີ້ໄຟລ໌ດຽວ. */
(function () {
  'use strict';

  // col/row = ຕຳແໜ່ງໃນ grid 3x3 ຂອງຫ້ອງການ (row 0 = ດ້ານຫຼັງ, row 2 = ດ້ານໜ້າ/ທາງເຂົ້າ)
  var departments = [
    { id: 'ceo',       name: 'CEO Office',            short: 'CEO',        col: 0, row: 0, color: '#f4d8a8', accent: '#c58b2a', head: 'e01', icon: 'fa-crown' },
    { id: 'meeting',   name: 'Meeting Room',          short: 'Meeting',    col: 1, row: 0, color: '#cfe3f7', accent: '#3b82f6', head: null,  icon: 'fa-people-group' },
    { id: 'finance',   name: 'Finance Department',    short: 'Finance',    col: 2, row: 0, color: '#cdeedd', accent: '#16a34a', head: 'e10', icon: 'fa-coins' },
    { id: 'sales',     name: 'Sales Department',      short: 'Sales',      col: 0, row: 1, color: '#fbd5d5', accent: '#ef4444', head: 'e03', icon: 'fa-handshake' },
    { id: 'marketing', name: 'Marketing Department',  short: 'Marketing',  col: 1, row: 1, color: '#f6d3ef', accent: '#d946ef', head: 'e07', icon: 'fa-bullhorn' },
    { id: 'hr',        name: 'HR Department',         short: 'HR',         col: 2, row: 1, color: '#ffe8c2', accent: '#f59e0b', head: 'e13', icon: 'fa-user-group' },
    { id: 'it',        name: 'IT Department',         short: 'IT',         col: 0, row: 2, color: '#d5d9f8', accent: '#6366f1', head: 'e16', icon: 'fa-server' },
    { id: 'reception', name: 'Reception',             short: 'Reception',  col: 1, row: 2, color: '#d3f0ef', accent: '#14b8a6', head: null,  icon: 'fa-bell-concierge' },
    { id: 'operations',name: 'Operations Department', short: 'Operations', col: 2, row: 2, color: '#e2e8d0', accent: '#65a30d', head: 'e21', icon: 'fa-gears' }
  ];

  // activity: work (ນັ່ງເຮັດວຽກ) | meeting (ເຂົ້າປະຊຸມ) | walk (ຍ່າງ) | break (ພັກ) | leave (ລາ/ບໍ່ຢູ່ຫ້ອງການ)
  // desk = ລຳດັບໂຕະໃນແຜນກ (ສຳລັບ work) · route = ເສັ້ນທາງຍ່າງ (ສຳລັບ walk)
  var employees = [
    { id: 'e01', name: 'Khamphoui Sengdara',  role: 'Chief Executive Officer',     dept: 'ceo',        activity: 'work',    desk: 0, task: 'Reviewing quarterly business plan', load: 82, tone: 1, hair: 0 },
    { id: 'e02', name: 'Noy Phommachanh',     role: 'Executive Assistant',         dept: 'ceo',        activity: 'work',    desk: 1, task: 'Scheduling board meeting',          load: 64, tone: 0, hair: 1 },

    { id: 'e03', name: 'Somphone Keomany',    role: 'Sales Manager',               dept: 'sales',      activity: 'work',    desk: 0, task: 'Checking monthly sales pipeline',   load: 78, tone: 1, hair: 2 },
    { id: 'e04', name: 'Vilay Souvannavong',  role: 'Senior Sales Executive',      dept: 'sales',      activity: 'work',    desk: 1, task: 'Preparing customer proposal',       load: 71, tone: 2, hair: 0 },
    { id: 'e05', name: 'Manivone Lasy',       role: 'Sales Executive',             dept: 'sales',      activity: 'meeting', desk: 2, task: 'Weekly sales sync',                 load: 55, tone: 0, hair: 1 },
    { id: 'e06', name: 'Bounmy Inthavong',    role: 'Sales Coordinator',           dept: 'sales',      activity: 'work',    desk: 3, task: 'Updating CRM records',              load: 48, tone: 1, hair: 2 },

    { id: 'e07', name: 'Dalavanh Chanthavong',role: 'Marketing Manager',           dept: 'marketing',  activity: 'meeting', desk: 0, task: 'Campaign kickoff meeting',          load: 80, tone: 0, hair: 1 },
    { id: 'e08', name: 'Sengphet Vongsa',     role: 'Graphic Designer',            dept: 'marketing',  activity: 'work',    desk: 1, task: 'Designing social media banners',    load: 74, tone: 2, hair: 0 },
    { id: 'e09', name: 'Ketsana Phimmasone',  role: 'Content Specialist',          dept: 'marketing',  activity: 'work',    desk: 2, task: 'Writing product article',           load: 62, tone: 1, hair: 1 },

    { id: 'e10', name: 'Sisavath Boupha',     role: 'Finance Manager',             dept: 'finance',    activity: 'work',    desk: 0, task: 'Approving payment requests',        load: 88, tone: 1, hair: 2 },
    { id: 'e11', name: 'Phonsavanh Rattana',  role: 'Senior Accountant',           dept: 'finance',    activity: 'work',    desk: 1, task: 'Reconciling monthly accounts',      load: 76, tone: 0, hair: 1 },
    { id: 'e12', name: 'Anousone Vilaylack',  role: 'Accounts Payable Officer',    dept: 'finance',    activity: 'meeting', desk: 2, task: 'Budget review with management',     load: 59, tone: 2, hair: 0 },

    { id: 'e13', name: 'Khounmy Saysana',     role: 'HR Manager',                  dept: 'hr',         activity: 'work',    desk: 0, task: 'Reviewing recruitment shortlist',   load: 69, tone: 0, hair: 1 },
    { id: 'e14', name: 'Thidavanh Keopaseuth',role: 'HR Officer',                  dept: 'hr',         activity: 'walk',    desk: 1, task: 'Delivering documents to departments', load: 52, tone: 1, hair: 1, route: 'A' },

    { id: 'e15', name: 'Sengdao Mounivong',   role: 'Office Receptionist',         dept: 'reception',  activity: 'work',    desk: 0, task: 'Welcoming visitors',                load: 45, tone: 0, hair: 1 },
    { id: 'e29', name: 'Lattana Khamvongsa',  role: 'Front Desk Assistant',        dept: 'reception',  activity: 'break',   desk: 1, task: 'Coffee break',                      load: 20, tone: 1, hair: 2, spot: 0 },

    { id: 'e16', name: 'Outhai Sayavong',     role: 'IT Manager',                  dept: 'it',         activity: 'work',    desk: 0, task: 'Monitoring server health',          load: 85, tone: 1, hair: 0 },
    { id: 'e17', name: 'Phetsamone Douangdy', role: 'System Administrator',        dept: 'it',         activity: 'work',    desk: 1, task: 'Applying security patches',         load: 79, tone: 2, hair: 2 },
    { id: 'e18', name: 'Xaiyavong Thammavong',role: 'Software Developer',          dept: 'it',         activity: 'work',    desk: 2, task: 'Building internal dashboard',       load: 91, tone: 1, hair: 0 },
    { id: 'e19', name: 'Vanida Sihalath',     role: 'IT Support Specialist',       dept: 'it',         activity: 'walk',    desk: 3, task: 'Helping staff with workstation issue', load: 58, tone: 0, hair: 1, route: 'B' },

    { id: 'e20', name: 'Chanthaphone Xayasane', role: 'Operations Analyst',        dept: 'operations', activity: 'work',    desk: 1, task: 'Analyzing delivery performance',    load: 73, tone: 2, hair: 1 },
    { id: 'e21', name: 'Bounthavy Oudomsouk', role: 'Operations Manager',          dept: 'operations', activity: 'meeting', desk: 0, task: 'Cross-department planning',         load: 83, tone: 1, hair: 0 },
    { id: 'e22', name: 'Soukanh Phanthavong', role: 'Logistics Coordinator',       dept: 'operations', activity: 'walk',    desk: 2, task: 'Checking warehouse schedule',       load: 66, tone: 2, hair: 2, route: 'C' },

    { id: 'e23', name: 'Viengsay Luangkhot',  role: 'Procurement Officer',         dept: 'operations', activity: 'break',   desk: 3, task: 'Coffee break',                      load: 25, tone: 0, hair: 1, spot: 1 },
    { id: 'e24', name: 'Phouvong Insisiengmay',role: 'Business Development Lead',  dept: 'sales',      activity: 'meeting', desk: 4, task: 'Weekly sales sync',                 load: 77, tone: 1, hair: 0 },
    { id: 'e25', name: 'Malivan Chounlamany', role: 'Digital Marketing Specialist',dept: 'marketing',  activity: 'walk',    desk: 3, task: 'Photo shoot coordination',          load: 61, tone: 0, hair: 1, route: 'D' },

    { id: 'e26', name: 'Kongkeo Sithixay',    role: 'Payroll Specialist',          dept: 'hr',         activity: 'leave',   desk: 2, task: 'On annual leave',                   load: 0,  tone: 1, hair: 2 },
    { id: 'e27', name: 'Nalinh Vannasouk',    role: 'Junior Accountant',           dept: 'finance',    activity: 'leave',   desk: 3, task: 'Working remotely',                  load: 0,  tone: 0, hair: 1 },
    { id: 'e28', name: 'Saysamone Phoutthavong', role: 'QA Engineer',              dept: 'it',         activity: 'meeting', desk: 4, task: 'Sprint planning',                   load: 70, tone: 1, hair: 0 }
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
