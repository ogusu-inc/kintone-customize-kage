members.forEach(member => { const dept = member['所属']?.value?.[0]?.['code'] || 'その他'; if (!departmentMap[dept]) departmentMap[dept] = []; departmentMap[dept].push(member); });

// Other code...

const affiliation = member['所属']?.value?.[0]?.['code'] || '';