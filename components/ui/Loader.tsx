import React from 'react';

interface LoaderProps {
  fullScreen?: boolean;
  text?: string;
}

export default function Loader({ fullScreen = false, text = 'Loading...' }: LoaderProps) {
  const loaderContent = (
    <div className="modern-loader-container">
      <div className="modern-loader-spinner"></div>
      {text && <p className="modern-loader-text">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="modern-loader-overlay">
        {loaderContent}
      </div>
    );
  }

  return loaderContent;
}
