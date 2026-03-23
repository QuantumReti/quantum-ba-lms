fetch('https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyC5h0hBZr1d7cguIYUxjhLxtPV6CjqaoLc')
.then(r => r.json())
.then(data => {
  if (!data.models) { console.log("No models returned:", data); return; }
  const audioModels = data.models.filter(m => m.name.includes('flash'));
  console.log(audioModels.map(m => m.name));
})
.catch(console.error);
