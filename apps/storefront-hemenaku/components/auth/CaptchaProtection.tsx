"use client";

import { useState, useEffect } from "react";
import { RotateCcw, Check } from "lucide-react";

interface CaptchaProtectionProps {
  onVerify: (isValid: boolean) => void;
  error?: string | null;
}

export function CaptchaProtection({ onVerify, error }: CaptchaProtectionProps) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [isVerified, setIsVerified] = useState(false);

  const generateNumbers = () => {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    setNum1(n1);
    setNum2(n2);
    setUserAnswer("");
    setIsVerified(false);
    onVerify(false);
  };

  useEffect(() => {
    generateNumbers();
  }, []);

  const handleVerify = () => {
    const answer = parseInt(userAnswer);
    const correctAnswer = num1 + num2;
    if (isNaN(answer)) {
      onVerify(false);
      return;
    }
    const isValid = answer === correctAnswer;
    setIsVerified(isValid);
    onVerify(isValid);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUserAnswer(value);
    if (value.length >= 1 && value.length <= 2) {
      const answer = parseInt(value);
      const correctAnswer = num1 + num2;
      const isValid = answer === correctAnswer;
      setIsVerified(isValid);
      onVerify(isValid);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-700">
        Bot Korumasi
      </label>
      
      {/* Mobil: Dikey, Desktop: Yatay */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        
        {/* Matematik Problemi - Ortalanmis */}
        <div className="flex items-center justify-center gap-2 bg-gray-50 px-4 py-3 rounded-xl border border-gray-200 min-w-[140px]">
          <span className="text-lg font-bold text-gray-700">{num1}</span>
          <span className="text-lg font-bold text-gray-400">+</span>
          <span className="text-lg font-bold text-gray-700">{num2}</span>
          <span className="text-lg font-bold text-gray-400">=</span>
          <span className="text-lg font-bold text-primary">?</span>
        </div>

        {/* Cevap Input - Mobilde tam genislik */}
        <input
          type="number"
          value={userAnswer}
          onChange={handleChange}
          placeholder="Cevap"
          className="w-full sm:flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary transition-all text-center font-bold text-lg"
          disabled={isVerified}
        />

        {/* Refresh Button - Mobilde tam genislik */}
        <button
          type="button"
          onClick={generateNumbers}
          className="w-full sm:w-auto p-3 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors flex items-center justify-center"
          title="Yeni soru"
        >
          <RotateCcw className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Status */}
      {error && !isVerified && (
        <p className="text-sm text-red-600">
          Lutfen bot koruma islemini dogru tamamlayin.
        </p>
      )}

      {isVerified && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
          <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
          <span className="font-medium">Dogrulama basarili</span>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Guvenliginiz icin lutfen bu basit islemi cozun.
      </p>
    </div>
  );
}
