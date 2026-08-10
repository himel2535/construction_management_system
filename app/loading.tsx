import React from 'react';
import Loader from '@/components/ui/Loader';

export default function Loading() {
  // You can add any UI inside Loading, including a Skeleton.
  return <Loader fullScreen={true} text="Loading construction data..." />;
}
