import React from 'react';

// This is a special diagnostic component. It uses inline styles that do not depend on Tailwind CSS.
// Its only job is to prove that React is rendering correctly.

function App() {
  const containerStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#111827', // This is dark gray
    color: 'white',
    fontFamily: 'sans-serif',
    padding: '20px',
  };

  const boxStyle = {
    backgroundColor: '#059669', // This is a bright green
    padding: '40px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  };

  const headingStyle = {
    fontSize: '2.25rem',
    fontWeight: 'bold',
    color: 'white',
    marginBottom: '1rem',
  };

  const textStyle = {
    fontSize: '1.125rem',
    color: '#D1D5DB', // Light gray
  };

  return (
    <div style={containerStyle}>
      <div style={boxStyle}>
        <h1 style={headingStyle}>Diagnostic Test Successful!</h1>
        <p style={textStyle}>If you can see this message, the core React application is working correctly.</p>
        <p style={textStyle}>The problem is with the API key configuration in your Netlify settings.</p>
      </div>
    </div>
  );
}

export default App;

