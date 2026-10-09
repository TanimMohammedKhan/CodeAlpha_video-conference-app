function InputField({ label, id, icon: Icon, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        {Icon && <Icon className="input-icon" size={18} />}
        <input id={id} {...props} />
      </div>
    </div>
  );
}

export default InputField;