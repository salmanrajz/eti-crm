import { useState, useCallback } from 'react';
import { NumberCheckService } from '../services/numberCheckService';
import { toast } from 'react-hot-toast';

interface UseNumberCheckReturn {
  isChecking: boolean;
  checkNumber: (number: string) => Promise<boolean>;
  checkAndReserve: (number: string, reserveCallback: () => Promise<void>) => Promise<void>;
}

export function useNumberCheck(): UseNumberCheckReturn {
  const [isChecking, setIsChecking] = useState(false);

  const checkNumber = useCallback(async (number: string): Promise<boolean> => {
    setIsChecking(true);
    try {
      const canReserve = await NumberCheckService.canReserveNumber(number);
      return canReserve;
    } catch (error) {
      console.error('Error checking number:', error);
      toast.error('Unable to verify number status. Please try again.');
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const checkAndReserve = useCallback(async (
    number: string, 
    reserveCallback: () => Promise<void>
  ): Promise<void> => {
    setIsChecking(true);
    
    try {
      const canReserve = await NumberCheckService.canReserveNumber(number);
      
      if (!canReserve) {
        // Number is active, show error message
        toast.error('Cannot reserve number - number is active', {
          duration: 5000,
          style: {
            background: '#ef4444',
            color: 'white',
            fontSize: '16px',
            fontWeight: '600'
          }
        });
        return;
      }
      
      // Number is not active, proceed with reservation
      await reserveCallback();
      
    } catch (error) {
      console.error('Error during number check and reservation:', error);
      toast.error('Unable to verify number status. Please try again.');
    } finally {
      setIsChecking(false);
    }
  }, []);

  return {
    isChecking,
    checkNumber,
    checkAndReserve
  };
}
