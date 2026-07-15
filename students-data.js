// Sample guest roster — test data for local development / demo purposes only.
// Replace with your own data before deploying to production.
// Optional fields:
//   course      — explicit course code: "GK","AK","KC","SCH","IT","WF-BC","WF-C","WF-IT"
//   startTime   — "HH:MM" override (default 09:00)
//   sparpreis   — true if the booking is on Sparpreis discount
window.TJKITE_GUESTS = [
  { name: "Test Student One", email: "test.student1@example.com", country: "NL", dob: "1990-01-01", arrival: "2026-06-01", departure: "2026-06-05", newsletter: false, address: "Testlaan 1, 1234 AB Voorbeeldstad, NL", course: "GK" },
  { name: "Test Student Two", email: "test.student2@example.com", country: "DE", dob: "1988-06-15", arrival: "2026-06-03", departure: "2026-06-07", newsletter: true, address: "Musterstraße 22, 12345 Musterstadt, DE", course: "AK", sparpreis: true },
  { name: "Test Student Three", email: "test.student3@example.com", country: "BE", dob: "1995-11-20", arrival: "2026-06-10", departure: "2026-06-12", newsletter: false, address: "Voorbeeldweg 5, 1000 Testville, BE", course: "WF-C", startTime: "15:00" }
];
