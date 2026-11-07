import React from 'react';
import { TextInput, PasswordInput } from '../forms';

export default function Input(props) {
  if (props.type === 'password' || props.showPasswordToggle) {
    return <PasswordInput {...props} />;
  }
  return <TextInput {...props} />;
}
